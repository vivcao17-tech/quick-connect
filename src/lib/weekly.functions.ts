import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const identity = z.object({ guestToken: z.string().uuid(), profileId: z.string().uuid().optional() });
const choice = z.enum(["a", "b"]);

function monday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function weekly(db: Admin) {
  const week = monday();
  const { data: config, error } = await db.from("weekly_impression_config").select("question_keys").eq("week_start", week).maybeSingle();
  if (error) throw error;
  if (!config) return null;
  const { data: questions, error: qError } = await db.from("questions")
    .select("id, question_key, text, stem_self, option_a, option_b")
    .in("question_key", config.question_keys);
  if (qError) throw qError;
  const byKey = new Map((questions ?? []).map(q => [q.question_key, q]));
  const ordered = config.question_keys.map(key => byKey.get(key));
  if (ordered.some(q => !q)) throw new Error("A weekly question is missing");
  return { week, questions: ordered.filter((q): q is NonNullable<typeof q> => Boolean(q)) };
}

export const getWeeklyImpression = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const set = await weekly(db);
    if (!set) return null;
    const { data: cards } = await db.from("impression_cards").select("token")
      .eq("week_start", set.week).eq("subject_guest_token", data.guestToken).limit(1);
    return {
      week: set.week,
      token: cards?.[0]?.token ?? null,
      questions: set.questions.map(q => ({ key: q.question_key ?? q.id, text: q.stem_self ?? q.text, optionA: q.option_a, optionB: q.option_b })),
    };
  });

export const createWeeklyImpression = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.extend({
    name: z.string().trim().min(1).max(40),
    answers: z.array(z.object({ key: z.string(), option: choice })).min(2).max(3),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const set = await weekly(db);
    if (!set) throw new Error("No questions this week");
    const { data: cards } = await db.from("impression_cards").select("token")
      .eq("week_start", set.week).eq("subject_guest_token", data.guestToken).limit(1);
    if (cards?.[0]) return { token: cards[0].token };
    const selected = set.questions.slice(0, data.answers.length);
    if (data.answers.some((a, i) => a.key !== selected[i]?.question_key)) throw new Error("Questions changed. Refresh.");
    const { resolveIsTest } = await import("@/lib/testing.server");
    const isTest = await resolveIsTest(db as never, { guestToken: data.guestToken, profileId: data.profileId ?? null });
    const { data: session, error: sError } = await db.from("sessions")
      .insert({ kind: "impression_card", status: "ended", ended_at: new Date().toISOString(), is_test: isTest })
      .select("id").single();
    if (sError) throw sError;
    try {
      const { data: participant, error: pError } = await db.from("session_participants")
        .insert({ session_id: session.id, guest_token: data.guestToken, profile_id: data.profileId ?? null, display_name: data.name, role: "host" })
        .select("id").single();
      if (pError) throw pError;
      const { data: sqs, error: qError } = await db.from("session_questions")
        .insert(selected.map((q, i) => ({ session_id: session.id, question_id: q.id, order_index: i, revealed_at: new Date().toISOString(), snapshot: { text: q.stem_self ?? q.text, kind: "standard", options: [{ key: "a", label: q.option_a }, { key: "b", label: q.option_b }], chips: [] } })))
        .select("id, order_index");
      if (qError) throw qError;
      const ordered = [...(sqs ?? [])].sort((a, b) => a.order_index - b.order_index);
      if (ordered.length !== selected.length) throw new Error("Couldn't save the questions");
      const { error: aError } = await db.from("answers").insert(data.answers.map((a, i) => ({
        session_question_id: ordered[i].id, participant_id: participant.id, question_id: selected[i].id,
        option_key: a.option, visibility: "session", answer_role: "about_self",
      })));
      if (aError) throw aError;
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const { error: cError } = await db.from("impression_cards").insert({
        token, subject_guest_token: data.guestToken, subject_profile_id: data.profileId ?? null,
        subject_name: data.name, session_id: session.id, participant_id: participant.id,
        is_test: isTest, week_start: set.week,
      });
      if (cError) throw cError;
      return { token };
    } catch (error) {
      await db.from("sessions").delete().eq("id", session.id);
      throw error;
    }
  });

export const getWeeklyConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [config, questions] = await Promise.all([
      db.from("weekly_impression_config").select("week_start, question_keys").order("week_start", { ascending: false }).limit(16),
      db.from("questions").select("question_key, stem_self, text").eq("impression_pool", true).eq("active", true).order("question_key"),
    ]);
    if (config.error) throw config.error;
    if (questions.error) throw questions.error;
    return { weeks: config.data ?? [], questions: questions.data ?? [] };
  });

export const saveWeeklyConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ week: z.string().regex(/^\d{4}-\d\d-\d\d$/), keys: z.array(z.string()).length(3) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    if (new Date(`${data.week}T00:00:00Z`).getUTCDay() !== 1 || new Date(`${data.week}T00:00:00Z`).toISOString().slice(0, 10) !== data.week) throw new Error("Choose a Monday");
    if (new Set(data.keys).size !== 3) throw new Error("Choose three different questions");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: qError } = await db.from("questions").select("question_key").in("question_key", data.keys).eq("active", true).eq("impression_pool", true);
    if (qError || rows?.length !== 3) throw new Error("Choose three active impression questions");
    const { error } = await db.from("weekly_impression_config").upsert({ week_start: data.week, question_keys: data.keys });
    if (error) throw error;
    return { saved: true };
  });

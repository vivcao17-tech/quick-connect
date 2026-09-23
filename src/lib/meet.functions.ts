import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyProfileId } from "@/lib/verify-profile";

const choice = z.enum(["a", "b", "c"]);
const signupOnly = z.object({
  priority: z.enum(["fits", "different"]),
  friendRead: z.enum(["guess", "impression", "neither"]),
  meetingStyle: z.enum(["online", "one", "group"]),
  weekly: z.enum(["come", "maybe", "probably_not"]),
});
const openAnswers = z.object({
  interests: z.string().trim().min(1).max(300),
  easier: z.string().trim().max(500).default(""),
  missedConnection: z.string().trim().max(500).default(""),
});
const fields = z.object({
  firstName: z.string().trim().min(1).max(40),
  contact: z.string().trim().min(1).max(120),
  berkeleyEmail: z.string().trim().email().max(160),
  confirmed18: z.literal(true),
  consented: z.literal(true),
  availability: z.string().trim().min(1).max(100),
  answers: z.array(z.object({ questionId: z.string().uuid(), optionKey: choice })).length(10),
  signupAnswers: signupOnly,
  openAnswers,
});

type AdminClient = { from: (table: string) => any };
type MeetQuestion = {
  position: number;
  id: string;
  questionKey: string;
  text: string;
  optionA: string;
  optionB: string;
  pack: string;
};

async function activeMeet(admin: AdminClient) {
  const { data: event, error } = await admin
    .from("meet_events")
    .select("id, title, slot_label, starts_at, time_zone")
    .eq("active", true)
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new Error("There isn't an open meetup right now.");
  const { data: rows, error: questionsError } = await admin
    .from("meet_event_questions")
    .select("position, question:questions(id, question_key, text, option_a, option_b, pack)")
    .eq("event_id", event.id)
    .order("position");
  if (questionsError) throw questionsError;
  const questions: MeetQuestion[] = (rows ?? []).flatMap((row: any) =>
    row.question
      ? [{
          position: row.position as number,
          id: row.question.id as string,
          questionKey: row.question.question_key as string,
          text: row.question.text as string,
          optionA: row.question.option_a as string,
          optionB: row.question.option_b as string,
          pack: row.question.pack as string,
        }]
      : [],
  );
  if (questions.length !== 10) throw new Error("The meetup question set is incomplete.");
  return {
    event: {
      id: event.id as string,
      title: event.title as string,
      slotLabel: event.slot_label as string,
      startsAt: event.starts_at as string,
      timeZone: event.time_zone as string,
    },
    questions,
  };
}

async function saveSignup(
  admin: AdminClient,
  input: z.infer<typeof fields>,
  source: "online" | "paper",
  profileId: string | null,
  guestToken: string,
) {
  const form = await activeMeet(admin);
  const expected = form.questions.map((question) => question.id);
  if (input.answers.some((answer, index) => answer.questionId !== expected[index])) {
    throw new Error("The meetup questions changed. Refresh and try again.");
  }
  if (!/@berkeley\.edu$/i.test(input.berkeleyEmail)) {
    throw new Error("Use your Berkeley email.");
  }

  const { resolveIsTest } = await import("@/lib/testing.server");
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({
      kind: "meet_signup",
      status: "ended",
      ended_at: new Date().toISOString(),
      is_test: await resolveIsTest(admin as never, { guestToken, profileId }),
    })
    .select("id")
    .single();
  if (sessionError) throw sessionError;
  const { data: participant, error: participantError } = await admin
    .from("session_participants")
    .insert({ session_id: session.id, profile_id: profileId, guest_token: guestToken, display_name: input.firstName, role: "meet_signup" })
    .select("id")
    .single();
  if (participantError) throw participantError;
  const { data: sessionQuestions, error: questionError } = await admin
    .from("session_questions")
    .insert(form.questions.map((question, index) => ({
      session_id: session.id,
      question_id: question.id,
      order_index: index,
      snapshot: { text: question.text, kind: "standard", options: [{ key: "a", label: question.optionA }, { key: "b", label: question.optionB }], chips: [] },
    })))
    .select("id, question_id, order_index");
  if (questionError) throw questionError;
  const ordered = [...(sessionQuestions ?? [])].sort((a, b) => a.order_index - b.order_index);
  const { error: answerError } = await admin.from("answers").insert(
    input.answers.map((answer, index) => ({
      session_question_id: ordered[index]?.id,
      participant_id: participant.id,
      question_id: answer.questionId,
      option_key: answer.optionKey,
      visibility: "session",
    })),
  );
  if (answerError) throw answerError;
  const { data: signup, error: signupError } = await admin
    .from("meet_signups")
    .insert({
      event_id: form.event.id,
      profile_id: profileId,
      participant_id: participant.id,
      answer_session_id: session.id,
      first_name: input.firstName,
      contact: input.contact,
      berkeley_email: input.berkeleyEmail.toLowerCase(),
      confirmed_18: input.confirmed18,
      consented: input.consented,
      availability: input.availability,
      signup_answers: input.signupAnswers,
      open_answers: input.openAnswers,
      source,
    })
    .select("signup_number")
    .single();
  if (signupError) throw signupError;
  return { ok: true, signupNumber: Number(signup.signup_number) };
}

export const getMeetForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const form = await activeMeet(supabaseAdmin as unknown as AdminClient);
    const { data: existing } = await supabaseAdmin
      .from("meet_signups")
      .select("signup_number")
      .eq("event_id", form.event.id)
      .eq("profile_id", context.userId)
      .maybeSingle();
    return { ...form, alreadySignedUp: existing ? Number(existing.signup_number) : null };
  });

export const submitMeetSignup = createServerFn({ method: "POST" })
  .middleware([verifyProfileId, requireSupabaseAuth])
  .inputValidator((input: unknown) => fields.extend({ guestToken: z.string().uuid(), profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.profileId !== context.userId) throw new Error("Sign in again to continue.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveSignup(supabaseAdmin as unknown as AdminClient, data, "online", context.userId, data.guestToken);
  });

export const getAdminMeet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const form = await activeMeet(supabaseAdmin as unknown as AdminClient);
    const { data: signups, error } = await supabaseAdmin
      .from("meet_signups")
      .select("id, signup_number, first_name, contact, berkeley_email, confirmed_18, consented, availability, signup_answers, open_answers, source, created_at, answer_session_id")
      .eq("event_id", form.event.id)
      .order("signup_number");
    if (error) throw error;
  const sessionIds = (signups ?? [])
    .map((row) => row.answer_session_id as string | null)
    .filter((id): id is string => Boolean(id));
    const { data: answerRows } = sessionIds.length
      ? await supabaseAdmin
          .from("answers")
          .select("session_question_id, option_key, session_questions!inner(session_id, order_index, snapshot)")
          .in("session_questions.session_id", sessionIds)
      : { data: [] };
    const answersBySession = new Map<string, { position: number; optionKey: string; text: string; option: string }[]>();
    for (const row of (answerRows ?? []) as any[]) {
      const sq = Array.isArray(row.session_questions) ? row.session_questions[0] : row.session_questions;
      if (!sq?.session_id) continue;
      const snap = sq.snapshot as { text?: string; options?: { key: string; label: string }[] } | null;
      const list = answersBySession.get(sq.session_id) ?? [];
      list.push({
        position: Number(sq.order_index) + 1,
        optionKey: row.option_key,
        text: snap?.text ?? "",
        option: snap?.options?.find((option) => option.key === row.option_key)?.label ?? row.option_key,
      });
      answersBySession.set(sq.session_id, list);
    }
    return {
      ...form,
      signups: (signups ?? []).map((signup) => ({
        id: signup.id,
        signupNumber: Number(signup.signup_number),
        firstName: signup.first_name,
        contact: signup.contact,
        berkeleyEmail: signup.berkeley_email,
        confirmed18: signup.confirmed_18,
        consented: signup.consented,
        availability: signup.availability,
        signupAnswers: signup.signup_answers,
        openAnswers: signup.open_answers,
        source: signup.source,
        createdAt: signup.created_at,
        answers: [...(answersBySession.get(signup.answer_session_id ?? "") ?? [])].sort((a, b) => a.position - b.position),
      })),
    };
  });

export const addAdminMeetSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fields.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveSignup(supabaseAdmin as unknown as AdminClient, data, "paper", null, crypto.randomUUID());
  });

export const updateMeetEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid(), slotLabel: z.string().trim().min(1).max(100), startsAt: z.string().datetime() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("meet_events").update({ slot_label: data.slotLabel, starts_at: data.startsAt, time_zone: "America/Los_Angeles" }).eq("id", data.eventId);
    if (error) throw error;
    return { ok: true };
  });
import { QUESTION_SELECT, snapshotRow } from "@/lib/irl-helpers";
import type { QuestionRow } from "@/lib/irl-helpers";
import { AB_TYPES } from "@/lib/remote-shared";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export const ASYNC_GROUP_KIND = "group_async";
export const ASYNC_QUESTION_COUNT = 5;
/** Nobody waits forever: two days after it opened, the room shows what it has. */
export const AUTO_REVEAL_HOURS = 48;

export async function asyncMember(admin: Admin, sessionId: string, guestToken: string) {
  const { data } = await admin
    .from("session_participants")
    .select("id, display_name, role")
    .eq("session_id", sessionId)
    .eq("guest_token", guestToken)
    .maybeSingle();
  return data;
}

/**
 * Questions for a remote group. Spice 2 by default — you don't get invited to
 * one of these by a stranger.
 *
 * Selection favours questions that historically produce a *clear minority*
 * rather than an even split: "only one person thinks that" is the hook.
 * Exclusion is limited to what the creator has already used in a group room.
 */
export async function pickAsyncGroupQuestions(
  admin: Admin,
  topicId: string | null,
  count = ASYNC_QUESTION_COUNT,
  creatorGuestToken?: string,
) {
  const { fetchPool, rankByHistory, spreadAcrossTopics, usedInGroupsBy } = await import(
    "@/lib/selection.server"
  );

  let pool = topicId
    ? await fetchPool(admin, { modes: ["group", "both"], spiceMax: 2, topicIds: [topicId] })
    : [];
  if (pool.length < count) {
    const wider = await fetchPool(admin, { modes: ["group", "both"], spiceMax: 2 });
    const seen = new Set(pool.map((q) => q.id));
    pool = [...pool, ...wider.filter((q) => !seen.has(q.id))];
  }
  if (pool.length === 0) return [] as QuestionRow[];

  const used = creatorGuestToken ? await usedInGroupsBy(admin, creatorGuestToken) : new Set<string>();

  // How lopsided each question has been across every session so far.
  const { data: history } = await admin
    .from("answers")
    .select("question_id, option_key")
    .in("question_id", pool.map((q) => q.id))
    .limit(8000);

  const tallies = new Map<string, Map<string, number>>();
  for (const row of history ?? []) {
    const byOption = tallies.get(row.question_id) ?? new Map<string, number>();
    byOption.set(row.option_key, (byOption.get(row.option_key) ?? 0) + 1);
    tallies.set(row.question_id, byOption);
  }

  const scored = pool.map((q) => {
    const byOption = tallies.get(q.id);
    const votes = byOption ? [...byOption.values()] : [];
    const total = votes.reduce((sum, n) => sum + n, 0);
    // Sweet spot: roughly three-quarters one way, so one or two people stand out.
    const lopsided = total >= 6 ? 1 - Math.abs(Math.max(...votes) / total - 0.78) * 2 : 0.55;
    const spiceBonus = q.spice_level >= 2 ? 0.12 : 0;
    const featured = q.is_featured ? 0.3 : 0;
    return { q, score: lopsided + spiceBonus + featured + Math.random() * 0.12 };
  });
  scored.sort((a, b) => b.score - a.score);

  // Fresh-for-the-creator first, then the rest; no more than two from one topic.
  const ordered = rankByHistory(scored.map((s) => s.q), used.size > 0 ? [used] : []);
  const byScore = new Map(scored.map((s, index) => [s.q.id, index]));
  const stable = [...ordered].sort((a, b) => {
    const aUsed = used.has(a.id) ? 1 : 0;
    const bUsed = used.has(b.id) ? 1 : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;
    return (byScore.get(a.id) ?? 0) - (byScore.get(b.id) ?? 0);
  });

  return spreadAcrossTopics(stable, count) as QuestionRow[];
}


export function asyncSnapshot(q: QuestionRow) {
  return snapshotRow(q);
}

export type RevealBlock = {
  sessionQuestionId: string;
  index: number;
  text: string;
  options: { key: OptionKey; label: string; names: string[]; mine: boolean }[];
  prompts: string[];
};

/**
 * Prompts are written for the person reading them, never for one randomly
 * chosen person, and never as an instruction to explain.
 */
export function promptsFor(
  meId: string,
  groups: { optionKey: OptionKey; label: string; people: { id: string; name: string }[] }[],
): string[] {
  const mine = groups.find((g) => g.people.some((p) => p.id === meId));
  const sole = groups.find((g) => g.people.length === 1 && groups.some((other) => other !== g && other.people.length > 1));
  const prompts: string[] = [];

  if (sole && mine === sole) {
    prompts.push("Last time this happened…");
  } else if (sole) {
    const only = sole.people[0]!.name;
    prompts.push(`Only ${only} picked "${sole.label}" — ask ${only}?`);
  }

  if (mine && mine.people.length > 1) {
    const others = mine.people.filter((p) => p.id !== meId).map((p) => p.name);
    if (others.length === 1) prompts.push(`Same answer as ${others[0]} — same reason?`);
    else if (others.length > 1) prompts.push(`Same answer as ${others[0]} and ${others[1]} — same reason?`);
  }

  return prompts;
}

/** Reveal everything at once, tell everyone, and never do it twice. */
export async function revealAsyncSession(admin: Admin, sessionId: string, trigger: string) {
  const { data: session } = await admin
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "revealed") return false;

  const now = new Date().toISOString();
  await admin
    .from("session_questions")
    .update({ revealed_at: now })
    .eq("session_id", sessionId)
    .is("revealed_at", null);
  await admin.from("sessions").update({ status: "revealed" }).eq("id", sessionId);

  await admin.from("events").insert({
    session_id: sessionId,
    name: "group_async_revealed",
    props: { trigger },
  });

  await notifyReveal(admin, sessionId);
  return true;
}

/** One notification per person, only ever on reveal — never when someone answers. */
async function notifyReveal(admin: Admin, sessionId: string) {
  const { data: people } = await admin
    .from("session_participants")
    .select("id, display_name")
    .eq("session_id", sessionId);

  const { data: sqs } = await admin
    .from("session_questions")
    .select("id, snapshot, order_index")
    .eq("session_id", sessionId)
    .order("order_index");
  const first = sqs?.[0];
  if (!first) return;

  const { ensureSessionLink } = await import("@/lib/session-link.server");
  const { sendSessionSavedEmail } = await import("@/lib/email.server");

  for (const person of people ?? []) {
    const token = await ensureSessionLink(admin, { sessionId, participantId: person.id });

    await admin.from("notifications").insert({
      participant_id: person.id,
      session_id: sessionId,
      session_question_id: first.id,
      actor_name: "Everyone",
      question_text: (first.snapshot as Snapshot | null)?.text ?? "your questions",
      link: `/ga/${sessionId}`,
    });

    const { data: address } = await admin
      .from("participant_emails")
      .select("email")
      .eq("participant_id", person.id)
      .maybeSingle();
    if (!address?.email) continue;

    await sendSessionSavedEmail(admin, {
      to: address.email,
      withName: "your group",
      isGroup: true,
      questionCount: sqs?.length ?? 0,
      path: `/s/${token}`,
    });
  }
}

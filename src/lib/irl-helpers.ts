import { AB_TYPES, snapshotOf } from "@/lib/remote-shared";

/** Pair sessions only ever see questions marked for pairs or for both modes. */
export const PAIR_MODES = ["pair", "both"];

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const QUESTION_SELECT =
  "id, topic_id, text, option_a, option_b, option_c, spice_level, question_type, stem_other, stem_self, follow_up, reason_chips(id, option_key, text)";

export type QuestionRow = {
  id: string;
  topic_id: string | null;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  spice_level: number;
  question_type?: string | null;
  stem_other?: string | null;
  stem_self?: string | null;
  follow_up?: string | null;
  reason_chips: { id: string; option_key: string; text: string }[] | null;
};


export function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let out = "";
  for (const byte of bytes) out += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return out;
}

export function snapshotRow(q: QuestionRow) {
  return snapshotOf({ ...q, chips: q.reason_chips ?? [] });
}

export async function memberOf(admin: Admin, sessionId: string, guestToken: string) {
  const { data: participant } = await admin
    .from("session_participants")
    .select("id, display_name, role")
    .eq("session_id", sessionId)
    .eq("guest_token", guestToken)
    .maybeSingle();
  if (!participant) throw new Error("Not in this room");
  return participant;
}

/** Candidate questions: intersection of both people's topics, otherwise evenly from each. */
export async function candidateQuestions(
  admin: Admin,
  sessionId: string,
  spiceMax: number,
  opts?: { spiceExact?: number; limit?: number },
) {
  const limit = opts?.limit ?? 3;
  const { data: picks } = await admin
    .from("session_participant_topics")
    .select("participant_id, topic_id")
    .eq("session_id", sessionId);

  const byParticipant = new Map<string, Set<string>>();
  for (const row of picks ?? []) {
    if (!byParticipant.has(row.participant_id)) byParticipant.set(row.participant_id, new Set());
    byParticipant.get(row.participant_id)!.add(row.topic_id);
  }
  const sets = [...byParticipant.values()];
  if (sets.length === 0) return [] as QuestionRow[];

  const union = [...new Set(sets.flatMap((s) => [...s]))];
  const intersection = union.filter((id) => sets.every((s) => s.has(id)));

  let query = admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .in("question_type", AB_TYPES as unknown as string[])
    .in("mode", PAIR_MODES)
    .in("topic_id", union);

  query =
    opts?.spiceExact !== undefined
      ? query.eq("spice_level", opts.spiceExact)
      : query.lte("spice_level", spiceMax);

  const { data: rows } = await query.order("id");

  const all = ((rows as QuestionRow[] | null) ?? []).filter(Boolean);


  if (intersection.length > 0) {
    const shared = all.filter((q) => q.topic_id && intersection.includes(q.topic_id));
    if (shared.length >= limit) return shared.slice(0, limit);
    const rest = all.filter((q) => !shared.includes(q));
    return [...shared, ...rest].slice(0, limit);
  }

  const picked: QuestionRow[] = [];
  let round = 0;
  while (picked.length < limit && round < limit * 2) {
    for (const set of sets) {
      if (picked.length >= limit) break;
      const next = all.find((q) => q.topic_id && set.has(q.topic_id) && !picked.includes(q));
      if (next) picked.push(next);
    }
    round += 1;
  }
  return picked.slice(0, limit);
}


/** True when these guests have already finished a session together before this one. */
export async function pairPlayedBefore(admin: Admin, sessionId: string, guestTokens: string[]) {
  const tokens = [...new Set(guestTokens.filter(Boolean))];
  if (tokens.length < 2) return false;

  const { data: rows } = await admin
    .from("session_participants")
    .select("session_id, guest_token")
    .in("guest_token", tokens)
    .neq("session_id", sessionId);

  const bySession = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    if (!row.guest_token) continue;
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, new Set());
    bySession.get(row.session_id)!.add(row.guest_token);
  }
  const shared = [...bySession.entries()]
    .filter(([, set]) => tokens.every((token) => set.has(token)))
    .map(([id]) => id);
  if (shared.length === 0) return false;

  const { data: finished } = await admin
    .from("sessions")
    .select("id")
    .in("id", shared)
    .eq("status", "ended");
  return (finished ?? []).length > 0;
}

/** One impression question from the bank, avoiding anything already in play. */
export async function pickImpressionQuestion(admin: Admin, excludeIds: string[]) {
  const { data: rows } = await admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .eq("question_type", "impression")
    .in("mode", PAIR_MODES);
  const pool = ((rows as QuestionRow[] | null) ?? []).filter((q) => !excludeIds.includes(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Draws questions straight from both people's topics and appends them to the room.
 * The first draw is fixed by position: Q1 spice 1, Q2 spice 2, Q3 impression.
 */
export async function seedQuestions(
  admin: Admin,
  sessionId: string,
  spiceMax: number,
  want: number,
) {
  const { data: existingRows, count } = await admin
    .from("session_questions")
    .select("question_id", { count: "exact" })
    .eq("session_id", sessionId);
  const offset = count ?? 0;
  const alreadyPlayed = (existingRows ?? []).map((row) => row.question_id);

  let chosen: QuestionRow[] = [];

  if (offset === 0) {
    const taken = new Set(alreadyPlayed);
    // Q1 and Q2 get an exact spice level each, so every room has one dividing question.
    for (const spice of [1, Math.min(2, Math.max(1, spiceMax))]) {
      if (chosen.length >= want) break;
      const exact = await candidateQuestions(admin, sessionId, spiceMax, {
        spiceExact: spice,
        limit: 4,
      });
      let next = exact.find((q) => !taken.has(q.id));
      if (!next) {
        const fallback = await candidateQuestions(admin, sessionId, spiceMax, { limit: 6 });
        next = fallback.find((q) => !taken.has(q.id));
      }
      if (next) {
        taken.add(next.id);
        chosen.push(next);
      }
    }
    if (chosen.length > 0 && want >= 3) {
      const impression = await pickImpressionQuestion(admin, [...taken]);
      if (impression) chosen = [...chosen.slice(0, want - 1), impression];
    }
  } else {
    const pool = await candidateQuestions(admin, sessionId, spiceMax, { limit: want + 3 });
    chosen = pool.filter((q) => !alreadyPlayed.includes(q.id)).slice(0, want);
  }


  if (chosen.length === 0) return 0;

  await admin.from("session_questions").insert(
    chosen.map((q, index) => ({
      session_id: sessionId,
      question_id: q.id,
      order_index: offset + index,
      snapshot: snapshotRow(q) as never,
    })),
  );
  return chosen.length;
}


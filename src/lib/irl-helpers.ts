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

/** Everyone in the room, with the identity we use to exclude what they've answered before. */
export async function sessionIdentities(admin: Admin, sessionId: string) {
  const { data } = await admin
    .from("session_participants")
    .select("id, guest_token, profile_id")
    .eq("session_id", sessionId);
  return data ?? [];
}

/** Topics: union of everyone's picks, with topics they both chose weighted up. */
export async function sessionTopics(admin: Admin, sessionId: string) {
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
  const union = [...new Set(sets.flatMap((s) => [...s]))];
  const shared = new Set(union.filter((id) => sets.length > 0 && sets.every((s) => s.has(id))));
  return { union, shared };
}

/**
 * Candidate questions for a pair room, in priority order: featured questions
 * neither has answered, then anything neither has answered, then questions one
 * of them has seen, then repeats. Never returns empty just because the pool is
 * exhausted.
 */
export async function candidateQuestions(
  admin: Admin,
  sessionId: string,
  spiceMax: number,
  opts?: { spiceExact?: number; limit?: number; exclude?: Set<string> },
) {
  const { drawQuestions } = await import("@/lib/selection.server");
  const limit = opts?.limit ?? 3;
  const rows = await drawQuestions(admin, {
    slots: [
      opts?.spiceExact !== undefined ? { count: limit, spice: opts.spiceExact } : { count: limit },
    ],
    sessionId,
    modes: PAIR_MODES,
    spiceMax,
    exclude: [...(opts?.exclude ?? [])],
    useSessionTopics: true,
    excludeSessionQuestions: true,
  });
  return rows as QuestionRow[];
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
export async function pickImpressionQuestion(
  admin: Admin,
  excludeIds: string[],
  opts?: { sessionId?: string; guestTokens?: (string | null)[]; profileIds?: (string | null)[] },
) {
  const { drawQuestions } = await import("@/lib/selection.server");
  const rows = await drawQuestions(admin, {
    slots: [{ count: 1, types: ["impression"] }],
    modes: PAIR_MODES,
    spiceMax: 2,
    exclude: excludeIds,
    ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts?.guestTokens ? { guestTokens: opts.guestTokens } : {}),
    ...(opts?.profileIds ? { profileIds: opts.profileIds } : {}),
  });
  return (rows[0] as QuestionRow | undefined) ?? null;
}

/** Positional plan for a pair room: Q1 easy, Q2 the one that divides, Q3 impression. */
function slotFor(index: number, spiceMax: number) {
  if (index === 0) return { count: 1, spice: 1 };
  if (index === 1) return { count: 1, spice: Math.min(2, Math.max(1, spiceMax)) };
  if (index === 2) return { count: 1, types: ["impression"] };
  return { count: 1 };
}

/**
 * Draws questions straight from both people's topics and appends them to the room.
 * Everything — per-person exclusion, priority tiers, topic spread and positional
 * spice — happens in one database call.
 */
export async function seedQuestions(
  admin: Admin,
  sessionId: string,
  spiceMax: number,
  want: number,
  knownOffset?: number,
) {
  const { drawQuestions } = await import("@/lib/selection.server");

  let offset = knownOffset;
  if (offset === undefined) {
    const { count } = await admin
      .from("session_questions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    offset = count ?? 0;
  }

  const slots = Array.from({ length: Math.max(0, want) }, (_, i) => slotFor(offset + i, spiceMax));
  if (slots.length === 0) return 0;

  const chosen = (await drawQuestions(admin, {
    slots,
    sessionId,
    modes: PAIR_MODES,
    spiceMax,
    useSessionTopics: true,
    excludeSessionQuestions: true,
  })) as QuestionRow[];

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

import { QUESTION_SELECT } from "@/lib/irl-helpers";
import type { QuestionRow } from "@/lib/irl-helpers";
import { AB_TYPES } from "@/lib/remote-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type SelectableRow = QuestionRow & { is_featured?: boolean | null };

export const SELECTION_SELECT = `${QUESTION_SELECT}, is_featured`;

/** Default ceilings by session type. */
export const SPICE_MAX = { pair: 2, group_irl: 1, group_remote: 2 } as const;

/** No more than this many questions from one topic in a single session. */
export const MAX_PER_TOPIC = 2;

/**
 * Everything one person has ever answered — across every partner, not just this
 * pair. Answering the same question with someone else is the same repetition.
 */
export async function answeredByPerson(
  admin: Admin,
  identity: { guestTokens?: (string | null | undefined)[]; profileIds?: (string | null | undefined)[] },
): Promise<Set<string>> {
  const tokens = (identity.guestTokens ?? []).filter((t): t is string => Boolean(t));
  const profiles = (identity.profileIds ?? []).filter((p): p is string => Boolean(p));
  if (tokens.length === 0 && profiles.length === 0) return new Set();

  const ids = new Set<string>();
  if (tokens.length > 0) {
    const { data } = await admin.from("session_participants").select("id").in("guest_token", tokens);
    for (const row of data ?? []) ids.add(row.id);
  }
  if (profiles.length > 0) {
    const { data } = await admin.from("session_participants").select("id").in("profile_id", profiles);
    for (const row of data ?? []) ids.add(row.id);
  }
  if (ids.size === 0) return new Set();

  const { data: answers } = await admin
    .from("answers")
    .select("question_id")
    .in("participant_id", [...ids]);
  return new Set((answers ?? []).map((a) => a.question_id));
}

/** Questions this person has already used in a group room (group repetition only). */
export async function usedInGroupsBy(admin: Admin, guestToken: string): Promise<Set<string>> {
  const { data: parts } = await admin
    .from("session_participants")
    .select("session_id")
    .eq("guest_token", guestToken);
  const sessionIds = [...new Set((parts ?? []).map((p) => p.session_id))];
  if (sessionIds.length === 0) return new Set();

  const { data: sessions } = await admin
    .from("sessions")
    .select("id")
    .in("id", sessionIds)
    .in("kind", ["group", "group_async"]);
  const groupIds = (sessions ?? []).map((s) => s.id);
  if (groupIds.length === 0) return new Set();

  const { data: sqs } = await admin
    .from("session_questions")
    .select("question_id")
    .in("session_id", groupIds);
  return new Set((sqs ?? []).map((row) => row.question_id));
}

/** Active A/B bank rows for one session type, under the spice ceiling. */
export async function fetchPool(
  admin: Admin,
  opts: {
    modes: string[];
    spiceMax: number;
    spiceExact?: number;
    topicIds?: string[];
  },
): Promise<SelectableRow[]> {
  let query = admin
    .from("questions")
    .select(SELECTION_SELECT)
    .eq("active", true)
    .in("question_type", AB_TYPES as unknown as string[])
    .in("mode", opts.modes);

  query = opts.spiceExact !== undefined
    ? query.eq("spice_level", opts.spiceExact)
    : query.lte("spice_level", opts.spiceMax);

  if (opts.topicIds && opts.topicIds.length > 0) query = query.in("topic_id", opts.topicIds);

  const { data } = await query;
  return ((data as SelectableRow[] | null) ?? []).filter(Boolean);
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Priority order, best first:
 *   0. featured, nobody has answered it
 *   1. nobody has answered it
 *   2. only one of them has answered it
 *   3. both have answered it (never block a session on an empty pool)
 * A shared-topic bonus, when given, nudges within a tier only.
 */
export function rankByHistory(
  rows: SelectableRow[],
  answeredSets: Set<string>[],
  opts?: { bonusTopicIds?: Set<string> },
): SelectableRow[] {
  const scored = shuffle(rows).map((row) => {
    const seenBy = answeredSets.filter((set) => set.has(row.id)).length;
    let tier: number;
    if (seenBy === 0) tier = row.is_featured ? 0 : 1;
    else if (seenBy >= answeredSets.length && answeredSets.length > 0) tier = 3;
    else tier = 2;
    const bonus = opts?.bonusTopicIds && row.topic_id && opts.bonusTopicIds.has(row.topic_id) ? 1 : 0;
    return { row, key: tier * 10 - bonus };
  });
  scored.sort((a, b) => a.key - b.key);
  return scored.map((entry) => entry.row);
}

/**
 * Take `count` rows in the given order while keeping any one topic to at most
 * `maxPerTopic` — a session that draws five money questions is monotonous.
 * Falls back to the overflow rather than returning short.
 */
export function spreadAcrossTopics(
  rows: SelectableRow[],
  count: number,
  maxPerTopic = MAX_PER_TOPIC,
): SelectableRow[] {
  const taken: SelectableRow[] = [];
  const overflow: SelectableRow[] = [];
  const perTopic = new Map<string, number>();

  for (const row of rows) {
    if (taken.length >= count) break;
    const key = row.topic_id ?? "none";
    const used = perTopic.get(key) ?? 0;
    if (used >= maxPerTopic) {
      overflow.push(row);
      continue;
    }
    perTopic.set(key, used + 1);
    taken.push(row);
  }

  if (taken.length < count) {
    const seen = new Set(taken.map((row) => row.id));
    for (const row of overflow) {
      if (taken.length >= count) break;
      if (!seen.has(row.id)) taken.push(row);
    }
  }
  return taken.slice(0, count);
}

/** One question at an exact spice level, honouring priority and what's already picked. */
export async function pickAtSpice(
  admin: Admin,
  opts: {
    modes: string[];
    spiceMax: number;
    spice: number;
    answeredSets: Set<string>[];
    exclude: Set<string>;
    topicIds?: string[];
    bonusTopicIds?: Set<string>;
  },
): Promise<SelectableRow | null> {
  const tries: { spiceExact?: number; topicIds?: string[] }[] = [
    { spiceExact: opts.spice, topicIds: opts.topicIds },
    { spiceExact: opts.spice },
    { topicIds: opts.topicIds },
    {},
  ];
  for (const attempt of tries) {
    const pool = await fetchPool(admin, {
      modes: opts.modes,
      spiceMax: opts.spiceMax,
      spiceExact: attempt.spiceExact,
      topicIds: attempt.topicIds,
    });
    const ranked = rankByHistory(
      pool.filter((row) => !opts.exclude.has(row.id)),
      opts.answeredSets,
      { bonusTopicIds: opts.bonusTopicIds },
    );
    if (ranked[0]) return ranked[0];
  }
  return null;
}

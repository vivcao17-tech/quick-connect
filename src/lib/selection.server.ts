import type { QuestionRow } from "@/lib/irl-helpers";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type SelectableRow = QuestionRow & {
  is_featured?: boolean | null;
  /** How many times the person we drew for has answered this question before. */
  answered_count?: number;
  /** How many people in the draw have seen it before. */
  seen_by?: number;
};

/** Default ceilings by session type. */
export const SPICE_MAX = { pair: 2, group_irl: 1, group_remote: 2 } as const;

/** No more than this many questions from one topic in a single session. */
export const MAX_PER_TOPIC = 2;

/**
 * One slot in a draw. `spice` prefers (but never requires) that exact level;
 * `types` overrides the default A/B bank types — e.g. `["impression"]`.
 */
export type DrawSlot = { count?: number; spice?: number; types?: string[] };

export type DrawOptions = {
  slots: DrawSlot[];
  /** Draw for everyone in this room. */
  sessionId?: string | null | undefined;
  guestTokens?: (string | null | undefined)[] | undefined;
  profileIds?: (string | null | undefined)[] | undefined;
  modes?: string[] | undefined;
  spiceMax?: number | undefined;
  topicIds?: string[] | undefined;
  bonusTopicIds?: string[] | undefined;
  exclude?: string[] | undefined;
  maxPerTopic?: number | undefined;
  /**
   * 'answered' — anything these people have answered anywhere (pair rooms).
   * 'group_used' — only what they've already used in a group room.
   */
  history?: "answered" | "group_used" | undefined;
  /** Use the topics the room's players picked (union, with shared ones weighted up). */
  useSessionTopics?: boolean | undefined;
  /** Skip anything already queued in this room. */
  excludeSessionQuestions?: boolean | undefined;
};

/**
 * The whole selection in a single round trip: per-person exclusion, the
 * featured/unseen/seen priority tiers, the topic spread and positional spice
 * all run inside Postgres (`public.draw_questions`). Never returns empty just
 * because the pool is exhausted — repeats are allowed as a last resort.
 */
export async function drawQuestions(admin: Admin, opts: DrawOptions): Promise<SelectableRow[]> {
  const clean = <T>(items: (T | null | undefined)[] | undefined) =>
    (items ?? []).filter((item): item is T => Boolean(item));

  const args = {
    _slots: opts.slots as never,
    _guest_tokens: clean(opts.guestTokens),
    _profile_ids: clean(opts.profileIds),
    _modes: opts.modes ?? ["pair", "both"],
    _spice_max: opts.spiceMax ?? 2,
    _topic_ids: clean(opts.topicIds),
    _bonus_topic_ids: clean(opts.bonusTopicIds),
    _exclude: clean(opts.exclude),
    _max_per_topic: opts.maxPerTopic ?? MAX_PER_TOPIC,
    _history: opts.history ?? "answered",
    _use_session_topics: opts.useSessionTopics ?? false,
    _exclude_session_questions: opts.excludeSessionQuestions ?? false,
    ...(opts.sessionId ? { _session_id: opts.sessionId } : {}),
  };

  const { data, error } = await admin.rpc("draw_questions", args);
  if (error) throw error;
  return ((data as unknown as SelectableRow[] | null) ?? []).filter(Boolean);
}

/**
 * Take `count` rows in the given order while keeping any one topic to at most
 * `maxPerTopic`. Only needed where a caller re-sorts a drawn pool itself.
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

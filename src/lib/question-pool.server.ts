import { snapshotOf } from "@/lib/remote-shared";
import type { Snapshot } from "@/lib/remote-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type DrawnQuestion = { questionId: string; snapshot: Snapshot };

const QUESTION_SELECT = "id, topic_id, text, option_a, option_b, option_c, question_type, stem_other, stem_self, follow_up, reason_chips(id, option_key, text)";

type QuestionRow = {
  id: string;
  topic_id: string | null;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  question_type?: string | null;
  stem_other?: string | null;
  stem_self?: string | null;
  follow_up?: string | null;
  reason_chips: { id: string; option_key: string; text: string }[] | null;
};

/** Pair-eligible A/B questions only — never group-only rows, never inactive bank entries. */
function pairPool(admin: Admin) {
  return admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .in("question_type", ["ab", "ab_reason"])
    .in("mode", ["pair", "both"])
    .lte("spice_level", 2);
}

/** Every question id these guests have ever answered, plus the topics those questions belong to. */
export async function historyOf(admin: Admin, guestTokens: string[]) {
  const tokens = guestTokens.filter(Boolean);
  if (tokens.length === 0) return { questionIds: [] as string[], topicIds: [] as string[] };

  const { data: participants } = await admin
    .from("session_participants")
    .select("id")
    .in("guest_token", tokens);
  const participantIds = (participants ?? []).map((p) => p.id);
  if (participantIds.length === 0) return { questionIds: [], topicIds: [] };

  const { data: answers } = await admin
    .from("answers")
    .select("question_id")
    .in("participant_id", participantIds);
  const questionIds = [...new Set((answers ?? []).map((a) => a.question_id))];
  if (questionIds.length === 0) return { questionIds: [], topicIds: [] };

  const { data: questions } = await admin
    .from("questions")
    .select("topic_id")
    .in("id", questionIds);
  const topicIds = [
    ...new Set((questions ?? []).map((q) => q.topic_id).filter((id): id is string => Boolean(id))),
  ];
  return { questionIds, topicIds };
}

function weightedSample(pool: { row: QuestionRow; weight: number }[], count: number) {
  const remaining = [...pool];
  const picked: QuestionRow[] = [];
  while (picked.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      roll -= remaining[i]!.weight;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picked.push(remaining.splice(index, 1)[0]!.row);
  }
  return picked;
}

/**
 * Draw questions for a pair. Exclusion is per person — anything either of them has
 * answered with anyone drops a tier — and featured questions neither has seen come
 * first. Topics both chose are favoured, no topic appears more than twice, and an
 * exhausted bank falls back to repeats rather than blocking the session.
 */
export async function drawQuestions(
  admin: Admin,
  opts: { topicIdsA: string[]; topicIdsB: string[]; guestTokens: string[]; count: number },
): Promise<DrawnQuestion[]> {
  const { answeredByPerson, fetchPool, rankByHistory, spreadAcrossTopics } = await import(
    "@/lib/selection.server"
  );

  const a = new Set(opts.topicIdsA.filter(Boolean));
  const b = new Set(opts.topicIdsB.filter(Boolean));
  const union = [...new Set([...a, ...b])];
  const shared = new Set([...a].filter((id) => b.has(id)));

  const answeredSets = await Promise.all(
    opts.guestTokens.filter(Boolean).map((token) => answeredByPerson(admin, { guestTokens: [token] })),
  );

  let pool = union.length
    ? await fetchPool(admin, { modes: ["pair", "both"], spiceMax: 2, topicIds: union })
    : [];
  if (pool.length < opts.count) {
    const wider = await fetchPool(admin, { modes: ["pair", "both"], spiceMax: 2 });
    const seen = new Set(pool.map((row) => row.id));
    pool = [...pool, ...wider.filter((row) => !seen.has(row.id))];
  }

  const ranked = rankByHistory(pool, answeredSets, { bonusTopicIds: shared });
  const picked = spreadAcrossTopics(ranked, opts.count);

  return picked.map((row) => ({
    questionId: row.id,
    snapshot: snapshotOf({ ...row, chips: row.reason_chips ?? [] }),
  }));
}


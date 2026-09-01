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
 * Draw questions from the union of both participants' topics — topics both chose get double
 * weight — skipping anything either of them has answered before. Questions are always retrieved
 * from the bank, never generated.
 */
export async function drawQuestions(
  admin: Admin,
  opts: { topicIdsA: string[]; topicIdsB: string[]; guestTokens: string[]; count: number },
): Promise<DrawnQuestion[]> {
  const a = new Set(opts.topicIdsA.filter(Boolean));
  const b = new Set(opts.topicIdsB.filter(Boolean));
  const union = [...new Set([...a, ...b])];

  const { questionIds: answered } = await historyOf(admin, opts.guestTokens);
  const seen = new Set(answered);

  const { data: inTopics } = union.length
    ? await pairPool(admin).in("topic_id", union)
    : { data: [] as QuestionRow[] };

  const pool = ((inTopics as QuestionRow[] | null) ?? [])
    .filter((row) => !seen.has(row.id))
    .map((row) => ({
      row,
      weight: row.topic_id && a.has(row.topic_id) && b.has(row.topic_id) ? 2 : 1,
    }));

  let picked = weightedSample(pool, opts.count);

  // Not enough fresh questions inside those topics — widen to the rest of the bank, still fresh.
  if (picked.length < opts.count) {
    const { data: rest } = await pairPool(admin);
    const taken = new Set(picked.map((row) => row.id));
    const widened = ((rest as QuestionRow[] | null) ?? [])
      .filter((row) => !seen.has(row.id) && !taken.has(row.id))
      .map((row) => ({ row, weight: 1 }));
    picked = [...picked, ...weightedSample(widened, opts.count - picked.length)];
  }

  // Last resort: everyone has seen everything, so allow repeats rather than an empty run.
  if (picked.length < opts.count) {
    const { data: rest } = await pairPool(admin);
    const taken = new Set(picked.map((row) => row.id));
    const repeats = ((rest as QuestionRow[] | null) ?? [])
      .filter((row) => !taken.has(row.id))
      .map((row) => ({ row, weight: 1 }));
    picked = [...picked, ...weightedSample(repeats, opts.count - picked.length)];
  }

  return picked.map((row) => ({
    questionId: row.id,
    snapshot: snapshotOf({ ...row, chips: row.reason_chips ?? [] }),
  }));
}

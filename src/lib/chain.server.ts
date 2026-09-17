/**
 * Chain, server side.
 *
 * Four tables and no tree: a question bank, a week schedule, one self-answer
 * per person per week, and one row per guess. Everything the screens need is
 * derived from those rows — chain depth, node counts and rankings are
 * deliberately not stored, because they are scoreboards.
 */

import type { ChainOption, ChainQuestion, ChainWeek } from "@/lib/chain-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const QUESTION_SELECT = "id, text, option_a, option_b";

export function chainToken(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 22);
}

function asQuestion(row: {
  id: string;
  text: string;
  option_a: string;
  option_b: string;
}): ChainQuestion {
  return { id: row.id, text: row.text, optionA: row.option_a, optionB: row.option_b };
}

type WeekRow = {
  id: string;
  opens_at: string;
  settles_at: string;
  chain_questions: { id: string; text: string; option_a: string; option_b: string } | null;
};

function asWeek(row: WeekRow, now: number): ChainWeek | null {
  if (!row.chain_questions) return null;
  return {
    id: row.id,
    opensAt: row.opens_at,
    settlesAt: row.settles_at,
    open: new Date(row.opens_at).getTime() <= now && now < new Date(row.settles_at).getTime(),
    question: asQuestion(row.chain_questions),
  };
}

/** The week that is running right now, or the most recent one that has settled. */
export async function currentWeek(admin: Admin): Promise<ChainWeek | null> {
  const now = Date.now();
  const { data } = await admin
    .from("chain_weeks")
    .select(`id, opens_at, settles_at, chain_questions ( ${QUESTION_SELECT} )`)
    .lte("opens_at", new Date(now).toISOString())
    .order("opens_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? asWeek(data as unknown as WeekRow, now) : null;
}

export async function weekById(admin: Admin, weekId: string): Promise<ChainWeek | null> {
  const { data } = await admin
    .from("chain_weeks")
    .select(`id, opens_at, settles_at, chain_questions ( ${QUESTION_SELECT} )`)
    .eq("id", weekId)
    .maybeSingle();
  return data ? asWeek(data as unknown as WeekRow, Date.now()) : null;
}

export async function myAnswer(
  admin: Admin,
  weekId: string,
  personKey: string,
): Promise<{ option: ChainOption; displayName: string | null } | null> {
  const { data } = await admin
    .from("chain_answers")
    .select("option_key, display_name")
    .eq("week_id", weekId)
    .eq("person_key", personKey)
    .maybeSingle();
  if (!data) return null;
  return { option: data.option_key as ChainOption, displayName: data.display_name };
}

/**
 * Store this person's own answer once, then settle every guess already made
 * about them this week. A second guesser never asks them again.
 */
export async function saveSelfAnswer(
  admin: Admin,
  opts: {
    weekId: string;
    personKey: string;
    profileId?: string | undefined;
    displayName?: string | undefined;
    option: ChainOption;
    isTest: boolean;
  },
): Promise<void> {
  const existing = await myAnswer(admin, opts.weekId, opts.personKey);
  if (!existing) {
    await admin.from("chain_answers").insert({
      week_id: opts.weekId,
      person_key: opts.personKey,
      profile_id: opts.profileId ?? null,
      display_name: opts.displayName ?? null,
      option_key: opts.option,
      is_test: opts.isTest,
    });
  }
  const settled = existing?.option ?? opts.option;
  await admin
    .from("chain_guesses")
    .update({ subject_actual_option: settled })
    .eq("week_id", opts.weekId)
    .eq("subject_key", opts.personKey)
    .is("subject_actual_option", null);
  await recomputeMatches(admin, opts.weekId, opts.personKey);
}

async function recomputeMatches(admin: Admin, weekId: string, subjectKey: string) {
  const { data } = await admin
    .from("chain_guesses")
    .select("id, guessed_option, subject_actual_option")
    .eq("week_id", weekId)
    .eq("subject_key", subjectKey);
  await Promise.all(
    (data ?? [])
      .filter((row) => row.subject_actual_option)
      .map((row) =>
        admin
          .from("chain_guesses")
          .update({ matched: row.guessed_option === row.subject_actual_option })
          .eq("id", row.id),
      ),
  );
}

/** One guess. The subject is a typed name; their key is only known if we already have it. */
export async function saveGuess(
  admin: Admin,
  opts: {
    weekId: string;
    questionId: string;
    guesserKey: string;
    guesserProfileId?: string | undefined;
    guesserName: string;
    subjectName: string;
    subjectKey?: string | undefined;
    guessedOption: ChainOption;
    because?: string | undefined;
    isTest: boolean;
  },
): Promise<{ token: string }> {
  let actual: ChainOption | null = null;
  if (opts.subjectKey) {
    const answer = await myAnswer(admin, opts.weekId, opts.subjectKey);
    actual = answer?.option ?? null;
  }
  const token = chainToken();
  await admin.from("chain_guesses").insert({
    week_id: opts.weekId,
    question_id: opts.questionId,
    token,
    guesser_key: opts.guesserKey,
    guesser_profile_id: opts.guesserProfileId ?? null,
    guesser_name: opts.guesserName,
    subject_name: opts.subjectName,
    subject_key: opts.subjectKey ?? null,
    guessed_option: opts.guessedOption,
    because_text: opts.because?.trim() ? opts.because.trim().slice(0, 160) : null,
    subject_actual_option: actual,
    matched: actual ? actual === opts.guessedOption : null,
    is_test: opts.isTest,
  });
  return { token };
}

export type GuessRow = {
  id: string;
  week_id: string;
  question_id: string;
  token: string;
  guesser_key: string;
  guesser_name: string;
  subject_name: string;
  subject_key: string | null;
  guessed_option: ChainOption;
  because_text: string | null;
  subject_actual_option: ChainOption | null;
  matched: boolean | null;
  created_at: string;
};

const GUESS_SELECT =
  "id, week_id, question_id, token, guesser_key, guesser_name, subject_name, subject_key, guessed_option, because_text, subject_actual_option, matched, created_at";

export async function guessByToken(admin: Admin, token: string): Promise<GuessRow | null> {
  const { data } = await admin
    .from("chain_guesses")
    .select(GUESS_SELECT)
    .eq("token", token)
    .maybeSingle();
  return (data as GuessRow | null) ?? null;
}

/** Everyone who has read this person this week, oldest first — an accumulation, not a count. */
export async function guessesAbout(
  admin: Admin,
  weekId: string,
  subjectKey: string,
): Promise<GuessRow[]> {
  const { data } = await admin
    .from("chain_guesses")
    .select(GUESS_SELECT)
    .eq("week_id", weekId)
    .eq("subject_key", subjectKey)
    .order("created_at", { ascending: true });
  return (data ?? []) as GuessRow[];
}

export async function guessesBy(
  admin: Admin,
  weekId: string,
  guesserKey: string,
): Promise<GuessRow[]> {
  const { data } = await admin
    .from("chain_guesses")
    .select(GUESS_SELECT)
    .eq("week_id", weekId)
    .eq("guesser_key", guesserKey)
    .order("created_at", { ascending: true });
  return (data ?? []) as GuessRow[];
}

/** Attach a key to a guess the first time the named person opens their link. */
export async function claimSubject(
  admin: Admin,
  row: GuessRow,
  subjectKey: string,
): Promise<GuessRow> {
  const answer = await myAnswer(admin, row.week_id, subjectKey);
  const actual = row.subject_actual_option ?? answer?.option ?? null;
  await admin
    .from("chain_guesses")
    .update({
      subject_key: subjectKey,
      opened_at: new Date().toISOString(),
      subject_actual_option: actual,
      matched: actual ? actual === row.guessed_option : null,
    })
    .eq("id", row.id);
  return {
    ...row,
    subject_key: subjectKey,
    subject_actual_option: actual,
    matched: actual ? actual === row.guessed_option : null,
  };
}

/** The week's two splits: what people said about themselves, and what they guessed about others. */
export async function weekSplits(admin: Admin, weekId: string) {
  const [{ data: answers }, { data: guesses }] = await Promise.all([
    admin.from("chain_answers").select("option_key").eq("week_id", weekId).eq("is_test", false),
    admin.from("chain_guesses").select("guessed_option").eq("week_id", weekId).eq("is_test", false),
  ]);
  const selfA = (answers ?? []).filter((r) => r.option_key === "a").length;
  const selfTotal = (answers ?? []).length;
  const guessA = (guesses ?? []).filter((r) => r.guessed_option === "a").length;
  const guessTotal = (guesses ?? []).length;
  return { selfA, selfTotal, guessA, guessTotal };
}

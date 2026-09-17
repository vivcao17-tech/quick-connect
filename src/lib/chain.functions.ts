import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { optionLabel, revealSentence } from "@/lib/chain-shared";
import type { ChainOption, ChainQuestion, ChainWeek } from "@/lib/chain-shared";

const guest = z.string().uuid();
const option = z.enum(["a", "b"]);
const name = z.string().min(1).max(40);
const because = z.string().max(160).optional();

export type ChainLine = { text: string; because: string | null };

function readLine(
  question: ChainQuestion,
  row: { guesser_name: string; guessed_option: ChainOption; subject_actual_option: ChainOption | null; because_text: string | null },
): ChainLine {
  const guessed = optionLabel(question, row.guessed_option);
  const actual = optionLabel(question, row.subject_actual_option);
  const text = !row.subject_actual_option
    ? `${row.guesser_name} guessed ${guessed}`
    : row.guessed_option === row.subject_actual_option
      ? `${row.guesser_name} guessed ${guessed} — right`
      : `${row.guesser_name} guessed ${guessed} — you said ${actual}`;
  return { text, because: row.because_text };
}

function sentLine(
  question: ChainQuestion,
  row: { subject_name: string; guessed_option: ChainOption; subject_actual_option: ChainOption | null; because_text: string | null },
): ChainLine {
  const guessed = optionLabel(question, row.guessed_option);
  const actual = optionLabel(question, row.subject_actual_option);
  const text = !row.subject_actual_option
    ? `You guessed ${row.subject_name} ${guessed}`
    : row.guessed_option === row.subject_actual_option
      ? `You guessed ${row.subject_name} ${guessed}. Right.`
      : `You guessed ${row.subject_name} ${guessed}. ${row.subject_name} said ${actual}.`;
  return { text, because: row.because_text };
}

/** This week's question plus whatever has already happened to this person in it. */
export const getChainWeek = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest.optional(), profileId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chain = await import("@/lib/chain.server");
    const week = await chain.currentWeek(supabaseAdmin);
    if (!week) return { week: null as ChainWeek | null, mine: null, reads: [], sent: [] };

    if (!data.guestToken) return { week, mine: null, reads: [] as ChainLine[], sent: [] as ChainLine[] };

    const [mine, about, by] = await Promise.all([
      chain.myAnswer(supabaseAdmin, week.id, data.guestToken),
      chain.guessesAbout(supabaseAdmin, week.id, data.guestToken),
      chain.guessesBy(supabaseAdmin, week.id, data.guestToken),
    ]);

    return {
      week,
      mine: mine ? { option: mine.option, displayName: mine.displayName } : null,
      reads: about.map((row) => readLine(week.question, row)),
      sent: by.map((row) => sentLine(week.question, row)),
    };
  });

/** Store the reader's own answer once. Later guesses settle against it automatically. */
export const answerChainSelf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        weekId: z.string().uuid(),
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        displayName: name.optional(),
        option,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveIsTest } = await import("@/lib/testing.server");
    const chain = await import("@/lib/chain.server");
    const isTest = await resolveIsTest(supabaseAdmin, {
      guestToken: data.guestToken,
      profileId: data.profileId ?? null,
    });
    await chain.saveSelfAnswer(supabaseAdmin, {
      weekId: data.weekId,
      personKey: data.guestToken,
      ...(data.profileId ? { profileId: data.profileId } : {}),
      ...(data.displayName ? { displayName: data.displayName } : {}),
      option: data.option,
      isTest,
    });
    return { ok: true };
  });

/**
 * One guess about one named person. `replyToToken` marks the guess back at
 * whoever sent the link — that person's key is already known, so the comparison
 * settles immediately.
 */
export const addChainGuess = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        weekId: z.string().uuid(),
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        guesserName: name,
        subjectName: name,
        guessedOption: option,
        because,
        replyToToken: z.string().min(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveIsTest } = await import("@/lib/testing.server");
    const chain = await import("@/lib/chain.server");
    const week = await chain.weekById(supabaseAdmin, data.weekId);
    if (!week) throw new Error("No week");

    let subjectKey: string | undefined;
    if (data.replyToToken) {
      const parent = await chain.guessByToken(supabaseAdmin, data.replyToToken);
      subjectKey = parent?.guesser_key;
    }

    const isTest = await resolveIsTest(supabaseAdmin, {
      guestToken: data.guestToken,
      profileId: data.profileId ?? null,
    });

    const { token } = await chain.saveGuess(supabaseAdmin, {
      weekId: week.id,
      questionId: week.question.id,
      guesserKey: data.guestToken,
      ...(data.profileId ? { guesserProfileId: data.profileId } : {}),
      guesserName: data.guesserName,
      subjectName: data.subjectName,
      ...(subjectKey ? { subjectKey } : {}),
      guessedOption: data.guessedOption,
      ...(data.because ? { because: data.because } : {}),
      isTest,
    });
    return { token };
  });

/** Everything the landing page needs: the question, where this person is, and the reveal. */
export const openChainLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(8),
        guestToken: guest,
        profileId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chain = await import("@/lib/chain.server");

    const found = await chain.guessByToken(supabaseAdmin, data.token);
    if (!found) throw new Error("Unknown link");
    const week = await chain.weekById(supabaseAdmin, found.week_id);
    if (!week) throw new Error("Unknown link");

    // The sender opening their own link should not become the subject.
    const isSender = found.guesser_key === data.guestToken;
    const row = isSender ? found : await chain.claimSubject(supabaseAdmin, found, data.guestToken);

    const [mine, by, about] = await Promise.all([
      chain.myAnswer(supabaseAdmin, week.id, data.guestToken),
      chain.guessesBy(supabaseAdmin, week.id, data.guestToken),
      chain.guessesAbout(supabaseAdmin, week.id, data.guestToken),
    ]);

    const guessBack = by.find((g) => g.subject_key === row.guesser_key) ?? null;
    const passOn = by.find((g) => g.subject_key !== row.guesser_key) ?? null;

    const step: "guess_back" | "self" | "pass" | "reveal" = isSender
      ? "reveal"
      : !guessBack
        ? "guess_back"
        : !mine
          ? "self"
          : !passOn
            ? "pass"
            : "reveal";

    const theirGuess = {
      name: row.guesser_name,
      guessed: optionLabel(week.question, row.guessed_option),
      because: row.because_text,
      yourAnswer: optionLabel(week.question, mine?.option ?? row.subject_actual_option),
      matched:
        mine?.option || row.subject_actual_option
          ? row.guessed_option === (mine?.option ?? row.subject_actual_option)
          : null,
    };

    const myGuess = guessBack
      ? {
          name: guessBack.subject_name,
          guessed: optionLabel(week.question, guessBack.guessed_option),
          because: guessBack.because_text,
          theirAnswer: optionLabel(week.question, guessBack.subject_actual_option),
          matched: guessBack.matched,
        }
      : null;

    return {
      week,
      step,
      yourName: row.subject_name,
      senderName: row.guesser_name,
      isSender,
      myOption: mine?.option ?? null,
      theirGuess,
      myGuess,
      sentence: revealSentence({
        otherName: row.guesser_name,
        theyReadYou: theirGuess.matched,
        youReadThem: myGuess?.matched ?? null,
      }),
      passOn: passOn ? { name: passOn.subject_name, token: passOn.token } : null,
      otherReads: about
        .filter((g) => g.id !== row.id)
        .map((g) => readLine(week.question, g)),
    };
  });

/** Sunday: what happened to this person, and the week's gap. No counts of people. */
export const getChainSettlement = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest.optional(),
        profileId: z.string().uuid().optional(),
        weekId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const chain = await import("@/lib/chain.server");
    const week = data.weekId
      ? await chain.weekById(supabaseAdmin, data.weekId)
      : await chain.currentWeek(supabaseAdmin);
    if (!week) return { week: null, lines: [] as ChainLine[], gap: null, hardest: null };

    const [about, by, splits] = await Promise.all([
      data.guestToken
        ? chain.guessesAbout(supabaseAdmin, week.id, data.guestToken)
        : Promise.resolve([]),
      data.guestToken ? chain.guessesBy(supabaseAdmin, week.id, data.guestToken) : Promise.resolve([]),
      chain.weekSplits(supabaseAdmin, week.id),
    ]);

    const lines = [
      ...about.map((row) => readLine(week.question, row)),
      ...by.map((row) => sentLine(week.question, row)),
    ];

    // Only speak about the split when both sides have enough rows to mean anything.
    const enough = splits.selfTotal >= 5 && splits.guessTotal >= 5;
    const selfPct = splits.selfTotal ? Math.round((splits.selfA / splits.selfTotal) * 100) : 0;
    const guessPct = splits.guessTotal ? Math.round((splits.guessA / splits.guessTotal) * 100) : 0;
    const selfSide = selfPct >= 50 ? week.question.optionA : week.question.optionB;
    const guessSide = guessPct >= 50 ? week.question.optionA : week.question.optionB;
    const gap = enough
      ? {
          selfLine: `${selfPct >= 50 ? selfPct : 100 - selfPct}% of people said they ${selfSide.toLowerCase()}.`,
          guessLine: `But when guessing others, ${guessPct >= 50 ? guessPct : 100 - guessPct}% guessed ${guessSide.toLowerCase()}.`,
          observation:
            selfSide === guessSide
              ? "People read others the way they read themselves this week."
              : `Everyone thinks other people ${guessSide.toLowerCase()} more than they do.`,
        }
      : null;

    // Friends-only fallback: people this person actually crossed paths with.
    const circle = [...about.map((g) => g.guessed_option), ...by.map((g) => g.guessed_option)];
    const circleA = circle.filter((o) => o === "a").length;
    const friendSplit =
      !gap && circle.length >= 3
        ? `${Math.max(circleA, circle.length - circleA)} of your friends picked ${
            circleA >= circle.length - circleA ? week.question.optionA : week.question.optionB
          }.`
        : null;

    return { week, lines, gap, friendSplit, hardest: null };
  });

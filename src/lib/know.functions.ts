import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const choice = z.enum(["a", "b"]);
const identity = z.object({ guestToken: z.string().uuid(), profileId: z.string().uuid().optional() });

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

async function admin(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function findMyCard(db: Admin, guestToken: string, profileId?: string) {
  if (profileId) {
    const { data } = await db
      .from("impression_cards")
      .select("*")
      .eq("subject_profile_id", profileId)
      .is("week_start", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) return data[0];
  }
  const { data } = await db
    .from("impression_cards")
    .select("*")
    .eq("subject_guest_token", guestToken)
    .is("week_start", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const card = data?.[0] ?? null;
  if (card && profileId && !card.subject_profile_id) {
    await db.from("impression_cards").update({ subject_profile_id: profileId }).eq("id", card.id);
  }
  return card;
}

type GuessRow = {
  guesser_session_id: string;
  guesser_display_name: string;
  question_key: string;
  guessed_option: string;
  created_at: string;
};

async function guessesFor(db: Admin, cardId: string): Promise<GuessRow[]> {
  const { data } = await db
    .from("impression_guesses")
    .select("guesser_session_id, guesser_display_name, question_key, guessed_option, created_at, id")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  return (data ?? []) as GuessRow[];
}

/** Resolve the questions attached to this card, not the latest starter set. */
async function cardQuestions(db: Admin, sessionId: string) {
  const { data: assigned, error } = await db.from("session_questions")
    .select("question_id, order_index, snapshot")
    .eq("session_id", sessionId)
    .order("order_index");
  if (error) throw error;
  const ids = (assigned ?? []).map((row) => row.question_id);
  if (!ids.length) return [];
  const { data: rows, error: questionError } = await db.from("questions")
    .select("id, question_key, stem_self, stem_other, text, option_a, option_b, tag_a, tag_b")
    .in("id", ids);
  if (questionError) throw questionError;
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  return (assigned ?? []).map((row) => {
    const question = byId.get(row.question_id);
    if (!question) throw new Error("Card question is missing");
    return {
      id: row.question_id,
      key: question.question_key ?? row.question_id,
      selfText: question.stem_self ?? question.text,
      otherText: question.stem_other ?? question.text,
      optionA: question.option_a,
      optionB: question.option_b,
      tagA: question.tag_a,
      tagB: question.tag_b,
    };
  });
}

/** Subject's self-facing questions. Contains no one's answers. */
export const getKnowStart = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { loadKnowQuestions } = await import("@/lib/know.server");
    const [questions, card] = await Promise.all([
      loadKnowQuestions(db),
      findMyCard(db, data.guestToken, data.profileId),
    ]);
    return {
      questions: questions.map((q) => ({ key: q.key, text: q.selfText, optionA: q.optionA, optionB: q.optionB })),
      existingToken: card?.token ?? null,
    };
  });

export const createKnowCard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    identity
      .extend({
        name: z.string().trim().min(1).max(40),
        answers: z.array(z.object({ key: z.string(), option: choice })).length(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const existing = await findMyCard(db, data.guestToken, data.profileId);
    if (existing) return { token: existing.token };
    const { loadKnowQuestions } = await import("@/lib/know.server");
    const { resolveIsTest } = await import("@/lib/testing.server");
    const questions = await loadKnowQuestions(db);
    if (data.answers.some((a, i) => a.key !== questions[i]?.key)) throw new Error("Questions changed. Refresh.");
    const profileId = data.profileId ?? null;
    const isTest = await resolveIsTest(db as never, { guestToken: data.guestToken, profileId });

    const { data: session, error: sErr } = await db
      .from("sessions")
      .insert({ kind: "impression_card", status: "ended", ended_at: new Date().toISOString(), is_test: isTest })
      .select("id")
      .single();
    if (sErr) throw sErr;
    try {
      const { data: participant, error: pErr } = await db
        .from("session_participants")
        .insert({ session_id: session.id, profile_id: profileId, guest_token: data.guestToken, display_name: data.name, role: "host" })
        .select("id")
        .single();
      if (pErr) throw pErr;
      const { data: sqs, error: qErr } = await db
        .from("session_questions")
        .insert(
          questions.map((q, i) => ({
            session_id: session.id,
            question_id: q.id,
            order_index: i,
            revealed_at: new Date().toISOString(),
            snapshot: { text: q.selfText, kind: "standard", options: [{ key: "a", label: q.optionA }, { key: "b", label: q.optionB }], chips: [] },
          })),
        )
        .select("id, order_index");
      if (qErr) throw qErr;
      const ordered = [...(sqs ?? [])].sort((a, b) => a.order_index - b.order_index);
      const { error: aErr } = await db.from("answers").insert(
        data.answers.map((a, i) => ({
          session_question_id: ordered[i]!.id,
          participant_id: participant.id,
          question_id: questions[i]!.id,
          option_key: a.option,
          visibility: "session",
          answer_role: "about_self",
        })),
      );
      if (aErr) throw aErr;
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const { error: cErr } = await db.from("impression_cards").insert({
        token,
        subject_profile_id: profileId,
        subject_guest_token: data.guestToken,
        subject_name: data.name,
        session_id: session.id,
        participant_id: participant.id,
        is_test: isTest,
      });
      if (cErr) throw cErr;
      void (async () => {
        const { logCardEvent } = await import("@/lib/card-events.server");
        const { data: made } = await db.from("impression_cards").select("id").eq("token", token).maybeSingle();
        await logCardEvent(db, { event: "card_created", card_id: made?.id ?? null, guest_token: data.guestToken, user_id: profileId, meta: { kind: "starter" } });
      })().catch(() => undefined);
      return { token };
    } catch (error) {
      await db.from("sessions").delete().eq("id", session.id);
      throw error;
    }
  });

/** Public: what a friend needs to guess. Never includes the subject's answers. */
export const getGuessCard = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(6).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: card } = await db
      .from("impression_cards")
      .select("id, session_id, subject_name")
      .eq("token", data.token)
      .maybeSingle();
    if (!card) return null;
    const { firstName } = await import("@/lib/know.server");
    const name = firstName(card.subject_name);
    const questions = await cardQuestions(db, card.session_id);
    return {
      name,
      questions: questions.map((q) => ({ key: q.key, text: q.otherText.replace(/\{name\}/g, name), optionA: q.optionA, optionB: q.optionB })),
    };
  });

async function scoreFor(db: Admin, token: string, guesserSessionId: string) {
  const { data: card } = await db.from("impression_cards").select("*").eq("token", token).maybeSingle();
  if (!card) return null;
  const { latestSelfAnswers } = await import("@/lib/know.server");
  const [questions, { data: mine }] = await Promise.all([
    cardQuestions(db, card.session_id),
    db
      .from("impression_guesses")
      .select("question_key, guessed_option, created_at, id")
      .eq("card_id", card.id)
      .eq("guesser_session_id", guesserSessionId)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
  ]);
  const actual = await latestSelfAnswers(db, card.id, card.participant_id, questions);
  const guessed = new Map((mine ?? []).map((g) => [g.question_key, g.guessed_option]));
  if (guessed.size < questions.length) return { card, complete: false as const };
  const rows = questions.map((q) => {
    const theirs = actual.get(q.id) ?? null;
    const guess = guessed.get(q.key) ?? null;
    const label = (k: string | null) => (k === "a" ? q.optionA : k === "b" ? q.optionB : "");
    return { text: q.otherText, guessed: label(guess), actual: label(theirs), right: guess === theirs };
  });
  return { card, complete: true as const, rows, score: rows.filter((r) => r.right).length };
}

export const submitGuesses = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    identity
      .extend({
        token: z.string().min(6).max(40),
        name: z.string().trim().min(1).max(40),
        guesses: z.array(z.object({ key: z.string(), option: choice })).min(2).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { REQUIRE_AUTH_FOR_GUESS_RESULT, sendGuessEmail, firstName } = await import("@/lib/know.server");
    const { data: card } = await db.from("impression_cards").select("*").eq("token", data.token).maybeSingle();
    if (!card) throw new Error("This link doesn't work anymore.");
    if (card.subject_guest_token === data.guestToken || (data.profileId && card.subject_profile_id === data.profileId)) {
      throw new Error("This is your own card. Send it to friends.");
    }
    const questions = await cardQuestions(db, card.session_id);
    if (data.guesses.length !== questions.length || data.guesses.some((g, i) => g.key !== questions[i]?.key)) throw new Error("Questions changed. Refresh.");
    const { data: before } = await db
      .from("impression_guesses")
      .select("id")
      .eq("card_id", card.id)
      .eq("guesser_session_id", data.guestToken)
      .limit(1);
    const firstTime = (before ?? []).length === 0;
    {
      const { error } = await db.from("impression_guesses").insert(
        data.guesses.map((g) => ({
          card_id: card.id,
          guesser_profile_id: data.profileId ?? null,
          guesser_session_id: data.guestToken,
          guesser_display_name: data.name,
          question_key: g.key,
          guessed_option: g.option,
        })),
      );
      if (error) throw error;
    }
    const result = await scoreFor(db, data.token, data.guestToken);
    if (!result || !result.complete) throw new Error("Couldn't save your guesses.");
    {
      const { logCardEvent } = await import("@/lib/card-events.server");
      void logCardEvent(db, { event: "guess_completed", card_id: card.id, guest_token: data.guestToken, user_id: data.profileId ?? null, meta: { score: result.score, total: result.rows.length, first_time: firstTime } });
    }

    if (firstTime && card.subject_profile_id) {
      const { data: profile } = await db.from("profiles").select("email").eq("id", card.subject_profile_id).maybeSingle();
      if (profile?.email) await sendGuessEmail(db, profile.email, firstName(data.name), result.score);
    }
    const canSee = !REQUIRE_AUTH_FOR_GUESS_RESULT || Boolean(data.profileId);
    return { score: result.score, total: result.rows.length, rows: canSee ? result.rows : null };
  });

/** Return the latest complete guess to this device, including guests. */
export const getGuessResult = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.extend({ token: z.string().min(6).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { REQUIRE_AUTH_FOR_GUESS_RESULT } = await import("@/lib/know.server");
    const result = await scoreFor(db, data.token, data.guestToken);
    if (!result) return { status: "missing" as const };
    if (!result.complete) return { status: "not_guessed" as const };
    if (REQUIRE_AUTH_FOR_GUESS_RESULT && !data.profileId) {
      return { status: "locked" as const, score: result.score, total: result.rows.length };
    }
    return { status: "done" as const, score: result.score, total: result.rows.length, rows: result.rows };
  });

/** Subject's aggregate view. Marks new guesses as seen. */
export const getMyImpressions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.extend({ markSeen: z.boolean().default(false), week: z.string().regex(/^\d{4}-\d\d-\d\d$/).optional() }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const card = data.week
      ? await (async () => {
          const week = data.week;
          if (!week) return null;
          if (data.profileId) {
            const { data: byProfile } = await db.from("impression_cards").select("*")
              .eq("subject_profile_id", data.profileId).eq("week_start", week).order("created_at", { ascending: false }).limit(1);
            if (byProfile?.[0]) return byProfile[0];
          }
          const { data: byGuest } = await db.from("impression_cards").select("*")
            .eq("subject_guest_token", data.guestToken).eq("week_start", week).order("created_at", { ascending: false }).limit(1);
          return byGuest?.[0] ?? null;
        })()
      : await findMyCard(db, data.guestToken, data.profileId);
    if (!card) return null;
    const guesses = await guessesFor(db, card.id);
    const people = new Map<string, { name: string; at: string; guesses: Map<string, string> }>();
    for (const g of guesses) {
      const p = people.get(g.guesser_session_id) ?? { name: g.guesser_display_name, at: g.created_at, guesses: new Map() };
      p.guesses.set(g.question_key, g.guessed_option);
      p.at = g.created_at;
      p.name = g.guesser_display_name;
      people.set(g.guesser_session_id, p);
    }
    const seen = card.seen_at ? new Date(card.seen_at).getTime() : 0;
    const newCount = [...people.values()].filter((p) => new Date(p.at).getTime() > seen).length;
    const summary = { token: card.token, guessCount: people.size, newCount };
    if (!data.markSeen) return { ...summary, questions: null, guessers: null };

    const { latestSelfAnswers } = await import("@/lib/know.server");
    const questions = await cardQuestions(db, card.session_id);
    const actual = await latestSelfAnswers(db, card.id, card.participant_id, questions);
    const qs = questions.map((q) => {
      let a = 0;
      let b = 0;
      for (const p of people.values()) {
        const g = p.guesses.get(q.key);
        if (g === "a") a += 1;
        if (g === "b") b += 1;
      }
      const self = actual.get(q.id) ?? null;
      const total = a + b;
      const wrong = self === "a" ? b : self === "b" ? a : 0;
      const subject = (card.subject_name.split(/\s+/)[0] ?? card.subject_name) as string;
      const ownerText = q.selfText && !/^and\b/i.test(q.selfText.trim()) ? q.selfText : q.otherText.replace(/\{name\}/g, "you");
      return { key: q.key, text: q.otherText.replace(/\{name\}/g, subject), ownerText: ownerText.charAt(0).toUpperCase() + ownerText.slice(1), optionA: q.optionA, optionB: q.optionB, tagA: q.tagA, tagB: q.tagB, a, b, self, total, wrong };
    });
    const guessers = [...people.values()]
       .map((p) => ({
         name: p.name,
        at: p.at,
        score: questions.filter((q) => p.guesses.get(q.key) === actual.get(q.id)).length,
        picks: Object.fromEntries(p.guesses),
      }))
      .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    await db.from("impression_cards").update({ seen_at: new Date().toISOString() }).eq("id", card.id);
    return { ...summary, questions: qs, guessers };
  });

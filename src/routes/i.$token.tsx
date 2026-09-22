import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { PairSummary } from "@/components/PairSummary";
import { impressionStem, subjectName, withName } from "@/components/QuestionText";
import { Thread } from "@/components/Thread";
import { track } from "@/lib/track";
import { useEndScreenTracking } from "@/lib/end-tracking";
import { getGuestToken } from "@/lib/guest";
import {
  answerAsRecipient,
  getInvite,
  getInviteMeta,
  saveRecipientEmail,
  startInvite,
} from "@/lib/remote.functions";
import type { OptionKey, PlayQuestion } from "@/lib/remote-shared";

export const Route = createFileRoute("/i/$token")({
  component: InvitePage,
  // Names in the preview card: the link should read as one person writing to
  // another, not as a product blurb.
  loader: ({ params }) => getInviteMeta({ data: { token: params.token } }),
  head: ({ params, loaderData }) => {
    const sender = loaderData?.senderName || "A friend";
    const title = `${sender} has one question for you`;
    const description = loaderData?.prompt || "One question. Two ways to answer.";
    const url = `https://nosure.app/i/${params.token}`;
    const image = `https://nosure.app/api/public/og/invite/${params.token}`;
    return {
      meta: [
        { title: `${title} — NoSure` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

type Reveal = {
  senderName: string;
  kind: "standard" | "impression";
  needsSecondHalf: boolean;
  impression: {
    theirSelf: OptionKey;
    myReadOfThem: OptionKey;
    match: boolean;
    mySelf: OptionKey | null;
    theirReadOfMe: OptionKey | null;
    readMatch: boolean | null;
  } | null;
  sender: { optionKey: OptionKey; reason: string } | null;
  mine: { optionKey: OptionKey; reason: string } | null;
  revealed: boolean;
  tally: { optionKey: OptionKey; votes: number }[];
};

/** "work", "work and money", "work, money and love" */
function formatTopics(topics: string[]) {
  const list = topics.map((topic) => topic.toLowerCase());
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function InvitePage() {
  const { token } = Route.useParams();
  const [guestToken, setGuestToken] = useState("");
  const [intro, setIntro] = useState<{
    senderName: string;
    note: string;
    recipientLabel: string;
    questionCount: number;
    topics: string[];
  } | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"ask" | "done" | "skipped">("ask");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);

  const [stage, setStage] = useState<"landing" | "play" | "summary">("landing");
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [half, setHalf] = useState<"other" | "self">("other");
  const saveRef = useEndScreenTracking("remote", stage === "summary", { sessionId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useServerFn(getInvite);
  const start = useServerFn(startInvite);
  const answer = useServerFn(answerAsRecipient);
  const saveEmail = useServerFn(saveRecipientEmail);

  useEffect(() => {
    setGuestToken(getGuestToken());
    load({ data: { token } })
      .then((result) => {
        setIntro(result);
        track("invite_opened", {
          token,
          has_note: Boolean(result.note),
          question_count: result.questionCount,
          kind: "remote",
        });
      })
      .catch(() => setError("This link doesn't exist."));
  }, [token, load]);

  const current = questions[index];

  async function begin() {
    if (!guestToken || busy) return;
    setBusy(true);
    try {
      const result = await start({ data: { token, guestToken } });
      setQuestions(result.questions);
      setSessionId(result.childSessionId);
      setIndex(0);
      setStage("play");
      track(
        "session_started",
        { kind: "remote", question_count: result.questions.length, from_invite: true },
        { sessionId: result.childSessionId },
      );
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const impressionHalf = current?.kind === "impression" ? half : null;

  /* Timing: when this question first appeared, so answer_submitted can carry
     how long it actually took to decide. */
  const shownAt = useRef(Date.now());
  useEffect(() => {
    if (stage !== "play" || !current) return;
    shownAt.current = Date.now();
    track(
      "question_shown",
      {
        session_question_id: current.sessionQuestionId,
        order_index: index,
        kind: current.kind,
        half: current.kind === "impression" ? half : null,
      },
      { sessionId },
    );
  }, [stage, current?.sessionQuestionId, half, index, sessionId]);

  const revealShownAt = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal?.revealed || !current) return;
    revealShownAt.current = Date.now();
    track(
      "reveal_shown",
      { session_question_id: current.sessionQuestionId, order_index: index, kind: "remote" },
      { sessionId },
    );
  }, [reveal?.revealed, current?.sessionQuestionId, index, sessionId]);

  async function choose(optionKey: OptionKey, chipText?: string) {
    if (!current || busy) return;
    setBusy(true);
    try {
      const text = chipText ?? reason.trim();
      const answerRole =
        current.kind === "impression" && half === "other"
          ? ("about_other" as const)
          : ("about_self" as const);
      const result = await answer({
        data: {
          token,
          guestToken,
          sessionQuestionId: current.sessionQuestionId,
          optionKey,
          answerRole,
          ...(text ? { reasonText: text } : {}),
        },
      });
      track(
        "answer_submitted",
        {
          session_question_id: current.sessionQuestionId,
          order_index: index,
          option_key: optionKey,
          answer_role: answerRole,
          has_reason: Boolean(text),
          seconds: Math.round((Date.now() - shownAt.current) / 1000),
        },
        { sessionId },
      );
      // The impression question is answered in two halves before anything is revealed.
      if (result.needsSecondHalf) {
        setReason("");
        setHalf("self");
        return;
      }
      setReveal(result);
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function openSummary() {
    setReason("");
    setReveal(null);
    setHalf("other");
    setStage("summary");
  }

  function next() {
    if (revealShownAt.current && current) {
      track(
        "reveal_dwell",
        {
          session_question_id: current.sessionQuestionId,
          seconds: Math.round((Date.now() - revealShownAt.current) / 1000),
        },
        { sessionId },
      );
      revealShownAt.current = null;
    }
    setReason("");
    setReveal(null);
    setHalf("other");
    if (index + 1 < questions.length) setIndex(index + 1);
    else void openSummary();
  }

  const labelOf = (key: OptionKey | undefined | null) =>
    current?.options.find((option) => option.key === key)?.label ?? "";

  const distribution = useMemo(() => {
    if (!reveal || !current) return null;
    const sum = reveal.tally.reduce((acc, row) => acc + row.votes, 0) || 1;
    const rows = current.options.map((option) => {
      const votes = reveal.tally.find((row) => row.optionKey === option.key)?.votes ?? 0;
      return { ...option, votes, share: Math.round((votes / sum) * 100) };
    });
    const top = [...rows].sort((a, b) => b.votes - a.votes)[0];
    return { rows, withMost: top?.key === reveal.mine?.optionKey };
  }, [reveal, current]);

  return (
    <main className="paper min-h-screen bg-background">
      {stage === "landing" && (
        <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          {error && <p className="text-lg">{error}</p>}
          {!error && intro && (
            <>
              <h1 className="text-5xl leading-[1.05]">
                {intro.senderName} answered three questions
                {intro.topics.length > 0 && (
                  <>
                    {" "}
                    about <em className="italic text-primary">{formatTopics(intro.topics)}</em>
                  </>
                )}
                .
              </h1>
              {intro.note && (
                <p className="card-soft mt-8 px-6 py-5 font-display text-3xl leading-snug italic">
                  "{intro.note}"
                </p>
              )}
              <p className="mt-8 text-lg">Three questions — and one about you.</p>
              <p className="mt-2 text-muted-foreground">
                Their answers unlock once you've answered. 30 seconds · no signup
              </p>
              <button
                onClick={begin}
                disabled={busy}
                className="btn-ink mt-8 self-start hover:opacity-90"
              >
                Start
              </button>

              <footer className="mt-16 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <Link to="/terms" className="underline underline-offset-4">
                  Terms
                </Link>
                <Link to="/privacy" className="underline underline-offset-4">
                  Privacy
                </Link>
                <a href="mailto:hello@nosure.app" className="underline underline-offset-4">
                  Contact
                </a>
              </footer>
            </>
          )}
        </section>
      )}

      {stage === "play" && current && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <div
            className={
              impressionHalf && !reveal
                ? `rounded-3xl px-6 py-6 ${
                    impressionHalf === "other"
                      ? "bg-secondary/60 ring-1 ring-border"
                      : "bg-card ring-1 ring-primary/40"
                  }`
                : ""
            }
          >
            {impressionHalf === "other" && !reveal && (
              <p className="mt-3 text-sm tracking-[0.24em] text-muted-foreground uppercase">
                Guess:
              </p>
            )}
            <h1
              className={`text-4xl leading-tight ${
                impressionHalf === "other" && !reveal ? "mt-2" : "mt-3"
              }`}
            >
              {impressionHalf
                ? withName(
                    impressionStem(current, impressionHalf, intro?.senderName),
                    impressionHalf === "self" ? "You" : subjectName("other", intro?.senderName),
                  )
                : current.text}
            </h1>
          </div>

          {!reveal && (
            <>
              <div className="mt-10 flex flex-col gap-3">
                {current.options.map((option) => (
                  <button
                    key={option.key}
                    disabled={busy}
                    onClick={() => choose(option.key)}
                    className="card-soft px-6 py-5 text-left text-lg hover:border-primary disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why? (one line, optional)"
                className="mt-6 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
            </>
          )}

          {reveal && distribution && (
            <div className="mt-10">
              <div>
                <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">You</p>
                <p className="mt-2 text-2xl">{labelOf(reveal.mine?.optionKey)}</p>
                {reveal.mine?.reason && (
                  <p className="mt-1 text-base italic text-muted-foreground">
                    "{reveal.mine.reason}"
                  </p>
                )}
              </div>

              {reveal.revealed ? (
                <>
                  <div className="mt-10">
                    <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
                      {reveal.senderName}
                    </p>
                    <p className="mt-2 text-2xl text-primary">
                      {labelOf(reveal.sender?.optionKey)}
                    </p>
                    {reveal.sender?.reason && (
                      <p className="mt-1 text-base italic text-muted-foreground">
                        "{reveal.sender.reason}"
                      </p>
                    )}
                  </div>
                  {reveal.impression && (
                    <div className="mt-8 border-t border-border pt-6">
                      {(() => {
                        const imp = reveal.impression!;
                        const who = reveal.senderName;
                        const pairs = [
                          imp.mySelf && imp.theirReadOfMe
                            ? {
                                key: "about-me",
                                said: `You said: ${labelOf(imp.mySelf)}`,
                                read: `${who} read you as: ${labelOf(imp.theirReadOfMe)}`,
                                match: imp.readMatch === true,
                              }
                            : null,
                          {
                            key: "about-them",
                            said: `${who} said: ${labelOf(imp.theirSelf)}`,
                            read: `You read ${who} as: ${labelOf(imp.myReadOfThem)}`,
                            match: imp.match,
                          },
                        ].filter((row): row is NonNullable<typeof row> => row !== null);
                        // Lead with whichever one missed.
                        pairs.sort((a, b) => Number(a.match) - Number(b.match));
                        const allMatched = pairs.every((row) => row.match);
                        return (
                          <>
                            <div className="flex flex-col gap-6">
                              {pairs.map((row) => (
                                <div key={row.key}>
                                  <p className="text-xl leading-snug">{row.said}</p>
                                  <p className="text-xl leading-snug">{row.read}</p>
                                  <p
                                    className={`mt-1 text-lg ${row.match ? "text-muted-foreground" : "text-primary"}`}
                                  >
                                    {row.match ? "you called it" : "different"}
                                  </p>
                                </div>
                              ))}
                            </div>
                            {allMatched && (
                              <p className="mt-6 text-lg text-muted-foreground">
                                You both read each other exactly right.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <Thread
                    guestToken={guestToken}
                    sessionQuestionId={current.sessionQuestionId}
                    sessionId={sessionId}
                    compactRemote
                    becauseAnswer={labelOf(reveal.mine?.optionKey)}
                  />
                </>
              ) : (
                <p className="mt-10 text-lg text-muted-foreground italic">
                  Waiting for {reveal.senderName}.
                </p>
              )}

              <button onClick={next} className="btn-quiet mt-10 hover:bg-secondary">
                {index + 1 < questions.length ? "Next" : "That's the last one"}
              </button>
            </div>
          )}

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "summary" && (
        <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
          <h1 className="text-4xl leading-tight">Now go talk to them.</h1>

          {emailState === "ask" && (
            <div ref={saveRef} className="card-soft mt-8 px-6 py-5">
              <p className="text-lg leading-snug">
                Want to know what {intro?.senderName ?? "they"} says back? Keep this conversation.
              </p>
              <div className="mt-4 max-w-sm">
                <GoogleSignIn label="Continue with Google" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">or leave an email</p>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const clean = email.trim();
                  if (!clean || emailBusy) return;
                  setEmailBusy(true);
                  setEmailFailed(false);
                  void saveEmail({ data: { token, email: clean } })
                    .then((result) => {
                      if (result.sent) setEmailState("done");
                      else setEmailFailed(true);
                      track(
                        result.sent ? "email_captured" : "email_capture_failed",
                        { where: "remote_summary" },
                        { sessionId },
                      );
                    })
                    .catch(() => setEmailFailed(true))
                    .finally(() => setEmailBusy(false));
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-full border border-border bg-background px-5 py-3 text-base outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="btn-quiet shrink-0 hover:bg-secondary disabled:opacity-40"
                >
                  {emailBusy ? "Sending" : "Tell me"}
                </button>
              </form>
              {emailFailed && (
                <p className="mt-3 text-sm text-primary">
                  That email didn't go out. Try again in a moment.
                </p>
              )}
              <button
                onClick={() => {
                  setEmailState("skipped");
                  track("email_skipped", { where: "remote_summary" }, { sessionId });
                }}
                className="mt-3 text-sm text-muted-foreground underline underline-offset-4"
              >
                Not now
              </button>
            </div>
          )}
          {emailState === "done" && (
            <p className="mt-8 text-lg text-muted-foreground">Sent. Check your inbox.</p>
          )}

          <div className="mt-10">
            {guestToken && sessionId && (
              <PairSummary
                guestToken={guestToken}
                sessionId={sessionId}
                title="All three questions"
              />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { track as trackEvent } from "@/lib/track";

import QRCode from "qrcode";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Thread } from "@/components/Thread";
import { impressionStem, subjectName, withName } from "@/components/QuestionText";
import { TopicCloud } from "@/components/TopicCloud";
import type { CloudTopic } from "@/components/TopicCloud";

import { supabase } from "@/integrations/supabase/client";
import { getRevealPrompts } from "@/lib/ai-prompts.functions";
import type { RevealPrompts } from "@/lib/ai-prompts.functions";
import { getGuestToken } from "@/lib/guest";
import {
  advanceRoom,
  answerInRoom,
  getRoomState,
  pickTopics,
  saveSessionEmail,
  setSpice,
} from "@/lib/irl.functions";
import type { RoomState } from "@/lib/irl.functions";
import { logEvent } from "@/lib/play.functions";


const DIFFERENT_PROMPTS = [
  "What happened last time?",
  "Why does that feel better to you?",
  "What about when it's me?",
];

const SAME_PROMPTS = ["You both picked the same — but your reasons might be completely different."];

/** The whole in-person room: lobby → topics → questions → answer/reveal loop → end. */
export function Room({ sessionId }: { sessionId: string }) {
  const load = useServerFn(getRoomState);
  const submitTopics = useServerFn(pickTopics);
  const submitAnswer = useServerFn(answerInRoom);
  const advance = useServerFn(advanceRoom);
  const changeSpice = useServerFn(setSpice);
  const saveEmail = useServerFn(saveSessionEmail);
  const track = useServerFn(logEvent);

  const [guestToken, setGuestToken] = useState("");
  const [state, setState] = useState<RoomState | null>(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [topicDraft, setTopicDraft] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "sent" | "failed">("idle");
  const [qr, setQr] = useState("");
  const [openSq, setOpenSq] = useState("");
  const [aiPrompts, setAiPrompts] = useState<Record<string, RevealPrompts>>({});
  const pending = useRef(false);
  const fetchPrompts = useServerFn(getRevealPrompts);

  useEffect(() => setGuestToken(getGuestToken()), []);

  const refresh = useCallback(async () => {
    if (!guestToken || pending.current) return;
    pending.current = true;
    try {
      const next = await load({ data: { guestToken, sessionId } });
      setState(next);
      setLost(false);
    } catch {
      setLost(true);
    } finally {
      pending.current = false;
    }
  }, [guestToken, sessionId, load]);

  // Poll steadily so joining, disconnects and reconnects all restore the right screen.
  useEffect(() => {
    if (!guestToken) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [guestToken, refresh]);

  // Realtime nudges make the two screens flip together instead of up to 2s apart.
  useEffect(() => {
    if (!guestToken) return;
    const channel = supabase
      .channel(`room-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_questions", filter: `session_id=eq.${sessionId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [guestToken, sessionId, refresh]);

  const joinUrl =
    state?.roomCode && typeof window !== "undefined"
      ? `${window.location.origin}/join/${state.roomCode}`
      : "";

  useEffect(() => {
    if (!joinUrl) return;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 320, color: { dark: "#221c17", light: "#0000" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [joinUrl]);

  const other = state?.others[0];
  const current = state?.questions[state.currentIndex];

  /* Play-by-play analytics. Timing is measured from when a question first
     appeared on this screen, which is the only honest place to measure it. */
  const shownAt = useRef(Date.now());
  const revealShownAt = useRef<number | null>(null);
  const impressionStepKey =
    current?.questionType === "impression" ? (current.myAnswerAboutOther ? "self" : "other") : null;
  useEffect(() => {
    if (!current || current.revealed) return;
    shownAt.current = Date.now();
    trackEvent(
      "question_shown",
      {
        session_question_id: current.sessionQuestionId,
        order_index: state?.currentIndex ?? null,
        kind: current.questionType,
        half: impressionStepKey,
      },
      { sessionId },
    );
  }, [current?.sessionQuestionId, impressionStepKey, current?.revealed, sessionId]);

  useEffect(() => {
    if (!current?.revealed) {
      if (revealShownAt.current && current) {
        trackEvent(
          "reveal_dwell",
          {
            session_question_id: current.sessionQuestionId,
            seconds: Math.round((Date.now() - revealShownAt.current) / 1000),
          },
          { sessionId },
        );
      }
      revealShownAt.current = null;
      return;
    }
    revealShownAt.current = Date.now();
    trackEvent(
      "reveal_shown",
      { session_question_id: current.sessionQuestionId, kind: "irl_pair" },
      { sessionId },
    );
  }, [current?.revealed, current?.sessionQuestionId, sessionId]);
  const total = state?.questions.length ?? 0;
  const openQuestion = state?.questions.find((q) => q.sessionQuestionId === openSq);

  // Ask for AI prompts once per revealed question; the reveal itself never waits on this.
  useEffect(() => {
    // Only after reveal: before that, one side's answer alone makes the output generic.
    const revealedNow = state?.status === "revealed" && current?.revealed;
    const sqId = revealedNow ? current.sessionQuestionId : "";
    if (!guestToken || !sqId || aiPrompts[sqId]) return;
    let alive = true;
    void fetchPrompts({ data: { guestToken, sessionQuestionId: sqId } })
      .then((result) => {
        if (alive && result.source === "ai" && result.prompts.length > 0) {
          setAiPrompts((prev) => ({ ...prev, [sqId]: result }));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [
    guestToken,
    state?.status,
    current?.revealed,
    current?.sessionQuestionId,
    aiPrompts,
    fetchPrompts,
  ]);

  const reveal = useMemo(() => {
    if (!current?.revealed) return null;
    const keys = current.picks.map((p) => p.optionKey).filter(Boolean);
    const differs = new Set(keys).size > 1;
    const ai = aiPrompts[current.sessionQuestionId];
    return {
      differs,
      source: ai ? ("ai" as const) : ("template" as const),
      observation: ai?.observation ?? "",
      prompts: ai?.prompts ?? (differs ? DIFFERENT_PROMPTS : SAME_PROMPTS),
    };
  }, [current, aiPrompts]);


  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-lg text-muted-foreground">
          {lost ? "This room isn't open on this phone." : "One moment…"}
        </p>
      </main>
    );
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
        {state.status === "lobby" && (
          <div className="flex flex-col items-center text-center">
            <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Room open</p>
            <h1 className="mt-3 text-3xl leading-tight">
              {other ? `${other.name} is here.` : "Waiting for someone to join."}
            </h1>
            {qr && (
              <img
                src={qr}
                alt={`QR code to join room ${state.roomCode}`}
                className="mt-6 h-[min(60vw,20rem)] w-[min(60vw,20rem)]"
              />
            )}
            <p className="mt-4 text-lg text-muted-foreground">
              or enter{" "}
              <span
                className="block mt-1 text-6xl leading-none font-semibold tracking-[0.2em]"
                style={{
                  color: `var(--code-ink-${
                    ((state.roomCode ?? "")
                      .split("")
                      .reduce((a, c) => a + c.charCodeAt(0), 0) %
                      6) +
                    1
                  })`,
                }}
              >
                {state.roomCode}
              </span>
            </p>


            <p className="mt-3 text-sm text-muted-foreground">
              They scan the code on your screen. Nothing to download.
            </p>
          </div>
        )}

        {state.status === "topic_select" && (
          <div>
            <h2 className="text-3xl">What's on your mind?</h2>
            <p className="mt-2 text-muted-foreground">Tap two words.</p>
            <div className="mt-8">
              <TopicCloud
                topics={state.topics}
                selectedIds={[...topicDraft, ...state.myTopicIds]}
                disabled={busy || state.myTopicsDone}
                onToggle={(topic: CloudTopic) =>
                  setTopicDraft((prev) =>
                    prev.includes(topic.id)
                      ? prev.filter((id) => id !== topic.id)
                      : prev.length >= 2
                        ? prev
                        : [...prev, topic.id],
                  )
                }
              />
            </div>

            {!state.myTopicsDone && (
              <button
                disabled={topicDraft.length !== 2 || busy}
                onClick={() => run(() => submitTopics({ data: { guestToken, sessionId, topicIds: topicDraft } }))}
                className="btn-ink mt-4 self-start disabled:opacity-30"
              >
                That's my two
              </button>
            )}

            <p className="mt-6 text-sm text-muted-foreground">
              {!other
                ? "Waiting for someone to join…"
                : state.myTopicsDone && other.topicsDone
                  ? "Both ready"
                  : state.myTopicsDone
                    ? `${other.name} is still picking…`
                    : `${other.name} ${other.topicsDone ? "is ready" : "is picking too"}`}
            </p>
          </div>
        )}

        {(state.status === "answering" || state.status === "revealed") && current && (
          <div>
            {(() => {
              const impressionStep =
                current.questionType === "impression" && !current.revealed
                  ? current.myAnswerAboutOther
                    ? "self"
                    : "other"
                  : null;
              const subject =
                impressionStep === "self"
                  ? "You"
                  : subjectName("other", current.otherName);
              return (
                <div
                  className={
                    impressionStep
                      ? `rounded-3xl px-6 py-6 ${
                          impressionStep === "other"
                            ? "bg-secondary/60 ring-1 ring-border"
                            : "bg-card ring-1 ring-primary/40"
                        }`
                      : ""
                  }
                >
                  <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">
                    Question {state.currentIndex + 1} of {total}
                  </p>
                  {impressionStep === "other" && (
                    <p className="mt-6 text-sm tracking-[0.24em] text-muted-foreground uppercase">
                      Guess:
                    </p>
                  )}
                  <h2 className={`text-4xl leading-tight ${impressionStep === "other" ? "mt-2" : "mt-6"}`}>
                    {impressionStep
                      ? withName(
                          impressionStem(current, impressionStep, current.otherName),
                          subject,
                        )
                      : current.text}
                  </h2>

                  {!current.revealed && !current.mySubmitted && (
                    <div className="mt-10 flex flex-col gap-3">
                      {current.options.map((option) => {
                        const answerRole =
                          current.questionType === "impression" && !current.myAnswerAboutOther
                            ? ("about_other" as const)
                            : ("about_self" as const);
                        return (
                          <button
                            key={`${answerRole}-${option.key}`}
                            disabled={busy}
                            onClick={() => {
                              trackEvent(
                                "answer_submitted",
                                {
                                  session_question_id: current.sessionQuestionId,
                                  order_index: state.currentIndex,
                                  option_key: option.key,
                                  answer_role: answerRole,
                                  seconds: Math.round((Date.now() - shownAt.current) / 1000),
                                },
                                { sessionId },
                              );
                              return run(() =>
                                submitAnswer({
                                  data: {
                                    guestToken,
                                    sessionQuestionId: current.sessionQuestionId,
                                    optionKey: option.key,
                                    answerRole,
                                  },
                                }),
                              );
                            }}
                            className="card-soft px-6 py-6 text-left text-xl hover:border-primary disabled:opacity-50"
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}


            {!current.revealed && current.mySubmitted && (
              <p className="mt-12 text-lg text-muted-foreground">
                Submitted — waiting for {other?.name ?? "them"}…
              </p>
            )}

            {current.revealed && current.impression && (
              <div className="mt-10">
                <div className="flex flex-col gap-4">
                  {current.impression.lines.map((line) => (
                    <p key={line.leadIn} className="text-2xl leading-snug">
                      <span className={line.match ? "text-foreground" : "text-primary"}>
                        {line.match ? "\u2713" : "\u2717"}
                      </span>{" "}
                      {line.leadIn} <strong className="font-semibold">{line.answer}</strong>.{" "}
                      {line.tail}{" "}
                      <strong className={`font-semibold ${line.match ? "" : "text-primary"}`}>
                        {line.tailAnswer}
                      </strong>
                      .
                    </p>
                  ))}
                </div>
                <p className="mt-6 text-lg text-muted-foreground">{current.impression.summary}</p>
              </div>
            )}

            {current.revealed && !current.impression && (
              <div className="mt-10">
                <div className={`card-soft px-6 py-6 ${reveal?.differs ? "border-primary" : ""}`}>
                  {current.picks.map((p) => (
                    <p key={p.name + String(p.isMe)} className="text-lg">
                      <span className="text-muted-foreground">{p.isMe ? "You" : p.name}: </span>
                      <span className={reveal?.differs ? "text-primary" : ""}>{p.label}</span>
                    </p>
                  ))}
                  <p className="mt-4 text-sm text-muted-foreground">
                    {reveal?.differs ? "You went different ways." : "Same answer."}
                  </p>
                </div>
              </div>
            )}

            {current.revealed && (
              <div>
                {reveal?.observation && (
                  <p className="mt-6 text-lg leading-snug">{reveal.observation}</p>
                )}

                <Thread
                  guestToken={guestToken}
                  sessionQuestionId={current.sessionQuestionId}
                  prompts={reveal?.prompts ?? []}
                  sessionId={sessionId}
                  promptSource={reveal?.prompts?.length ? "ai" : "template"}
                  onPrompt={(prompt: string) =>
                    void track({
                      data: {
                        guestToken,
                        sessionId,
                        name: "prompt_tapped",
                        props: {
                          prompt,
                          question_id: current.questionId,
                          source: reveal?.source ?? "template",
                        },
                      },
                    })
                  }
                />

                <button
                  onClick={() => {
                    void run(() => advance({ data: { guestToken, sessionId, action: "next" } }));
                  }}
                  className="btn-quiet mt-16"
                >
                  Next question
                </button>
              </div>
            )}


            <div className="mt-14 flex items-center gap-6 text-sm text-muted-foreground">
              <button
                onClick={() => {
                  void run(() => advance({ data: { guestToken, sessionId, action: "skip" } }));
                }}
                className="underline underline-offset-4"
              >
                Skip this one
              </button>
              <button
                onClick={() => {
                  void run(() => advance({ data: { guestToken, sessionId, action: "more" } }));
                }}
                className="underline underline-offset-4"
              >
                Add another question
              </button>
              <button
                onClick={() =>
                  run(() =>
                    changeSpice({
                      data: { guestToken, sessionId, spiceMax: state.spiceMax >= 3 ? 1 : state.spiceMax + 1 },
                    }),
                  )
                }
                className="underline underline-offset-4"
              >
                Adjust spice level ({state.spiceMax})
              </button>
            </div>
          </div>
        )}

        {state.status === "ended" && openQuestion && (
          <div>
            <button
              onClick={() => setOpenSq("")}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              All questions
            </button>
            <h2 className="mt-6 text-3xl leading-tight">{openQuestion.text}</h2>
            <div className="card-soft mt-6 px-6 py-6">
              {openQuestion.picks.map((p) => (
                <p key={p.name + String(p.isMe)} className="text-lg">
                  <span className="text-muted-foreground">{p.isMe ? "You" : p.name}: </span>
                  {p.label}
                </p>
              ))}
            </div>
            <Thread guestToken={guestToken} sessionQuestionId={openQuestion.sessionQuestionId} />
          </div>
        )}

        {state.status === "ended" && !openQuestion && (
          <div>
            <h2 className="text-4xl leading-tight">
              {total} question{total === 1 ? "" : "s"} today — you went different ways on{" "}
              {state.differing}.
            </h2>

            <div className="mt-10 flex flex-col gap-3">
              {state.questions
                .filter((q) => q.revealed)
                .map((q) => (
                  <button
                    key={q.sessionQuestionId}
                    onClick={() => setOpenSq(q.sessionQuestionId)}
                    className="card-soft px-6 py-5 text-left"
                  >
                    <p className="text-lg">{q.text}</p>
                    {q.picks.map((p) => (
                      <p key={p.name + String(p.isMe)} className="mt-1 text-base">
                        <span className="text-muted-foreground">{p.isMe ? "You" : p.name}: </span>
                        {p.label}
                      </p>
                    ))}
                  </button>
                ))}
            </div>


            <div className="mt-12">
              {saveState === "sent" ? (
                <p className="text-lg text-muted-foreground">Sent. Check your inbox.</p>
              ) : (
                <div className="flex max-w-sm flex-col gap-3">
                  <GoogleSignIn label="Continue with Google" redirectPath="/people" />
                  <p className="text-sm text-muted-foreground">or leave an email</p>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@email.com"
                    className="w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
                  />
                  <button
                    disabled={!email.includes("@") || busy}
                    onClick={() =>
                      run(async () => {
                        const result = await saveEmail({ data: { guestToken, sessionId, email } });
                        setSaveState(result.sent ? "sent" : "failed");
                        trackEvent(
                          result.sent ? "email_captured" : "email_capture_failed",
                          { where: "irl_end" },
                          { sessionId },
                        );
                      })
                    }
                    className="btn-ink self-start disabled:opacity-30"
                  >
                    Save this session
                  </button>
                  {saveState === "failed" && (
                    <p className="text-sm text-primary">
                      That email didn't go out. Try again in a moment.
                    </p>
                  )}
                </div>
              )}
            </div>


            <button
              onClick={() => run(() => advance({ data: { guestToken, sessionId, action: "more" } }))}
              className="mt-10 self-start text-sm text-muted-foreground underline underline-offset-4"
            >
              A few more questions
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

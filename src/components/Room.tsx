import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import QRCode from "qrcode";

import { Thread } from "@/components/Thread";

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
  voteQuestions,
} from "@/lib/irl.functions";
import type { RoomState } from "@/lib/irl.functions";
import { logEvent } from "@/lib/play.functions";

const SCATTER = [
  { top: 2, left: 6, size: 2.6, rotate: -7 },
  { top: 13, left: 55, size: 3.3, rotate: 4 },
  { top: 26, left: 16, size: 2.9, rotate: 8 },
  { top: 36, left: 61, size: 2.4, rotate: -5 },
  { top: 47, left: 8, size: 3.5, rotate: -2 },
  { top: 58, left: 52, size: 2.7, rotate: 6 },
  { top: 68, left: 18, size: 3.1, rotate: -9 },
  { top: 78, left: 58, size: 2.5, rotate: 3 },
  { top: 87, left: 10, size: 2.9, rotate: 5 },
  { top: 93, left: 56, size: 2.3, rotate: -4 },
];

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
  const submitVotes = useServerFn(voteQuestions);
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
  const [questionDraft, setQuestionDraft] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
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
          <div>
            <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Room open</p>
            <h1 className="mt-6 text-5xl leading-tight">
              {other ? `${other.name} is here.` : "Waiting for someone to join."}
            </h1>
            <p className="mt-8 text-7xl tracking-[0.2em]">{state.roomCode}</p>
            {qr && <img src={qr} alt={`QR code to join room ${state.roomCode}`} className="mt-6 h-48 w-48" />}
            <p className="mt-6 text-lg text-muted-foreground">
              They scan the code on your screen. Nothing to download.
            </p>
          </div>
        )}

        {state.status === "topic_select" && (
          <div>
            <h2 className="text-3xl">What's on your mind?</h2>
            <p className="mt-2 text-muted-foreground">Tap two words.</p>
            <div className="relative mt-8 h-[520px]">
              {state.topics.map((topic, i) => {
                const spot = SCATTER[i % SCATTER.length]!;
                const chosen = topicDraft.includes(topic.id) || state.myTopicIds.includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    disabled={busy || state.myTopicsDone}
                    onClick={() => {
                      setTopicDraft((prev) =>
                        prev.includes(topic.id)
                          ? prev.filter((id) => id !== topic.id)
                          : prev.length >= 2
                            ? prev
                            : [...prev, topic.id],
                      );
                    }}
                    className={`topic-word absolute hover:scale-105 ${chosen ? "text-primary" : ""}`}
                    style={{
                      top: `${spot.top}%`,
                      left: `${spot.left}%`,
                      fontSize: `${spot.size}rem`,
                      transform: `rotate(${spot.rotate}deg)`,
                    }}
                  >
                    {topic.label}
                  </button>
                );
              })}
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

        {state.status === "question_select" && (
          <div>
            <h2 className="text-3xl">Which of these?</h2>
            <p className="mt-2 text-muted-foreground">Tap the ones you'd want to hear.</p>
            <div className="mt-8 flex flex-col gap-3">
              {state.candidates.map((q) => {
                const chosen = questionDraft.includes(q.id);
                return (
                  <button
                    key={q.id}
                    disabled={state.myVotesDone}
                    onClick={() =>
                      setQuestionDraft((prev) =>
                        prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id],
                      )
                    }
                    className={`card-soft px-6 py-5 text-left text-lg ${chosen ? "border-primary text-primary" : ""}`}
                  >
                    {q.text}
                  </button>
                );
              })}
            </div>
            {!state.myVotesDone && (
              <button
                disabled={questionDraft.length === 0 || busy}
                onClick={() =>
                  run(() => submitVotes({ data: { guestToken, sessionId, questionIds: questionDraft } }))
                }
                className="btn-ink mt-8 self-start disabled:opacity-30"
              >
                Done
              </button>
            )}
            <p className="mt-6 text-sm text-muted-foreground">
              {state.myVotesDone && other?.questionsDone
                ? "Both ready"
                : state.myVotesDone && other
                  ? `${other.name} is still picking…`
                  : ""}
            </p>
          </div>
        )}

        {(state.status === "answering" || state.status === "revealed") && current && (
          <div>
            <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">
              Question {state.currentIndex + 1} of {total}
            </p>
            <h2 className="mt-6 text-4xl leading-tight">{current.text}</h2>

            {current.questionType === "impression" && !current.revealed && !current.mySubmitted && (
              <p className="mt-4 text-lg text-muted-foreground">
                {!current.myAnswerAboutOther
                  ? `Which one is ${current.otherName}?`
                  : "And you?"}
              </p>
            )}

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
                      onClick={() =>
                        run(() =>
                          submitAnswer({
                            data: {
                              guestToken,
                              sessionQuestionId: current.sessionQuestionId,
                              optionKey: option.key,
                              answerRole,
                            },
                          }),
                        )
                      }
                      className="card-soft px-6 py-6 text-left text-xl hover:border-primary disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}

            {!current.revealed && current.mySubmitted && (
              <p className="mt-12 text-lg text-muted-foreground">
                Submitted — waiting for {other?.name ?? "them"}…
              </p>
            )}

            {current.revealed && current.impression && (
              <div className="mt-10">
                <p className="text-2xl leading-snug">{current.impression.lead}</p>
                <div className="mt-6 flex flex-col gap-3">
                  {current.impression.pairs.map((pair) => (
                    <div
                      key={pair.title}
                      className={`card-soft px-6 py-6 ${pair.match ? "" : "border-primary"}`}
                    >
                      <p className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
                        {pair.title}
                      </p>
                      <p className="mt-3 text-lg">
                        <span className="text-muted-foreground">Says: </span>
                        {pair.selfLabel}
                      </p>
                      <p className="text-lg">
                        <span className="text-muted-foreground">Read as: </span>
                        <span className={pair.match ? "" : "text-primary"}>{pair.otherLabel}</span>
                      </p>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {pair.match ? "Same read." : "Different read."}
                      </p>
                    </div>
                  ))}
                </div>
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
              {saved ? (
                <p className="text-lg text-muted-foreground">Saved. Check your inbox.</p>
              ) : (
                <div className="flex flex-col gap-3">
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
                        await saveEmail({ data: { guestToken, sessionId, email } });
                        setSaved(true);
                      })
                    }
                    className="btn-ink self-start disabled:opacity-30"
                  >
                    Save this session
                  </button>
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

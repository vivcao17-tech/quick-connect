import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { track } from "@/lib/track";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import QRCode from "qrcode";

import { withName } from "@/components/QuestionText";

import {
  addConnection,
  answerInGroup,
  declineHostRequest,
  endGroupSession,
  getGroupState,
  handOffHost,
  nextGroupQuestion,
  requestHost,
  revealGroupQuestion,
  startGroup,
  startOneOnOne,
} from "@/lib/group.functions";
import type { GroupState } from "@/lib/group.functions";
import { useEndScreenTracking } from "@/lib/end-tracking";
import { getGuestToken } from "@/lib/guest";
import { saveSessionEmail } from "@/lib/irl.functions";

/** Informal, factual — never a request to explain. */
function onlyLine(names: string[]) {
  if (names.length === 1) return `Only ${names[0]}.`;
  if (names.length === 2) return `Just ${names[0]} and ${names[1]}.`;
  return "";
}

/** A room with more than two people in it: everyone answers, the host reveals. */
export function GroupRoom({ sessionId }: { sessionId: string }) {
  const load = useServerFn(getGroupState);
  const begin = useServerFn(startGroup);
  const answer = useServerFn(answerInGroup);
  const reveal = useServerFn(revealGroupQuestion);
  const next = useServerFn(nextGroupQuestion);
  const finish = useServerFn(endGroupSession);
  const ask = useServerFn(requestHost);
  const decline = useServerFn(declineHostRequest);
  const handOff = useServerFn(handOffHost);
  const connect = useServerFn(addConnection);
  const oneOnOne = useServerFn(startOneOnOne);
  const saveEmail = useServerFn(saveSessionEmail);

  const [guestToken, setGuestToken] = useState("");
  const [state, setState] = useState<GroupState | null>(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [handOffOpen, setHandOffOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "sent" | "failed">("idle");
  const [link, setLink] = useState("");
  const pending = useRef(false);
  const saveRef = useEndScreenTracking("group", state?.status === "ended", { sessionId });

  useEffect(() => setGuestToken(getGuestToken()), []);

  const refresh = useCallback(async () => {
    if (!guestToken || pending.current) return;
    pending.current = true;
    try {
      setState(await load({ data: { guestToken, sessionId } }));
      setLost(false);
    } catch {
      setLost(true);
    } finally {
      pending.current = false;
    }
  }, [guestToken, sessionId, load]);

  useEffect(() => {
    if (!guestToken) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [guestToken, refresh]);

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

  // Play-by-play analytics must sit above the early return so hook order is stable.
  const currentQ = state?.current ?? null;
  /* Timing + play-by-play, group room. */
  const shownAt = useRef(Date.now());
  const revealAt = useRef<number | null>(null);
  useEffect(() => {
    if (!currentQ || currentQ.revealed) return;
    shownAt.current = Date.now();
    track(
      "question_shown",
      { session_question_id: currentQ.sessionQuestionId, kind: "group" },
      { sessionId },
    );
  }, [currentQ?.sessionQuestionId, currentQ?.revealed, sessionId]);
  useEffect(() => {
    if (!currentQ?.revealed) {
      if (revealAt.current && currentQ) {
        track(
          "reveal_dwell",
          {
            session_question_id: currentQ.sessionQuestionId,
            seconds: Math.round((Date.now() - revealAt.current) / 1000),
          },
          { sessionId },
        );
      }
      revealAt.current = null;
      return;
    }
    revealAt.current = Date.now();
    track(
      "reveal_shown",
      { session_question_id: currentQ.sessionQuestionId, kind: "group" },
      { sessionId },
    );
  }, [currentQ?.revealed, currentQ?.sessionQuestionId, sessionId]);
  if (!state) {
    return (
      <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-lg text-muted-foreground">
          {lost ? "This room isn't open on this phone." : "One moment…"}
        </p>
      </main>
    );
  }

  const current = state.current;

  const top = state.differences[0];

  const host = state.participants.find((p) => p.isHost);
  const hostLine = host
    ? `${host.isMe ? "You're" : `${host.name} is`} running this — ${
        host.role === "host_observer" ? "not playing" : "playing too"
      }`
    : "";

  return (
    <main className="paper min-h-screen bg-background">
      <div className="relative mx-auto max-w-xl px-6 pt-6">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Room options"
          className="absolute right-6 top-6 text-2xl leading-none text-muted-foreground hover:text-foreground"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-6 top-14 z-10 w-64 rounded-2xl border border-border bg-card p-2 text-left text-sm">
            {!state.iAmHost && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void run(() => ask({ data: { guestToken, sessionId } }));
                }}
                className="block w-full rounded-xl px-3 py-2 text-left hover:bg-secondary"
              >
                Request host
              </button>
            )}
            {state.iAmHost && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setHandOffOpen(true);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left hover:bg-secondary"
              >
                Hand off host
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false);
                setConnectOpen(true);
              }}
              className="block w-full rounded-xl px-3 py-2 text-left hover:bg-secondary"
            >
              Add someone as a connection
            </button>
            {state.iAmHost && state.status !== "ended" && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void run(() => finish({ data: { guestToken, sessionId } }));
                }}
                className="block w-full rounded-xl px-3 py-2 text-left hover:bg-secondary"
              >
                End session
              </button>
            )}
          </div>
        )}
      </div>

      {handOffOpen && (
        <div className="mx-auto max-w-xl px-6 pt-4">
          <div className="card-soft px-6 py-5">
            <p className="text-sm text-muted-foreground">Who runs it now?</p>
            <div className="mt-3 flex flex-col gap-2">
              {state.participants
                .filter((p) => !p.isMe)
                .map((p) => (
                  <button
                    key={p.participantId}
                    onClick={() => {
                      setHandOffOpen(false);
                      void run(() =>
                        handOff({ data: { guestToken, sessionId, toParticipantId: p.participantId } }),
                      );
                    }}
                    className="text-left text-lg underline underline-offset-4"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setHandOffOpen(false)}
              className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {connectOpen && (
        <div className="mx-auto max-w-xl px-6 pt-4">
          <div className="card-soft px-6 py-5">
            <p className="text-sm text-muted-foreground">Add someone in the room</p>
            <div className="mt-3 flex flex-col gap-2">
              {state.participants
                .filter((p) => !p.isMe)
                .map((p) => (
                  <button
                    key={p.participantId}
                    disabled={p.connected}
                    onClick={() =>
                      void run(() =>
                        connect({ data: { guestToken, sessionId, targetParticipantId: p.participantId } }),
                      )
                    }
                    className="text-left text-lg underline underline-offset-4 disabled:no-underline disabled:opacity-50"
                  >
                    {p.name}
                    {p.connected ? " — added" : ""}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setConnectOpen(false)}
              className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {state.hostRequest && (
        <div className="mx-auto max-w-xl px-6 pt-4">
          <div className="card-soft px-6 py-4">
            {state.hostRequest.isMine ? (
              <p className="text-base">
                You asked to run this. It transfers in {state.hostRequest.secondsLeft}s unless they say
                no.
              </p>
            ) : state.iAmHost ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-base">
                  {state.hostRequest.name} wants to run this. {state.hostRequest.secondsLeft}s.
                </p>
                <button
                  onClick={() =>
                    void run(() =>
                      decline({ data: { guestToken, sessionId, requestId: state.hostRequest!.id } }),
                    )
                  }
                  className="text-sm underline underline-offset-4"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <p className="text-base">{state.hostRequest.name} asked to run this.</p>
            )}
          </div>
        </div>
      )}

      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
        {hostLine && (
          <p className="mb-6 self-start rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
            {hostLine}
          </p>
        )}
        {state.status === "lobby" && (
          <div>
            <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Room open</p>
            <p className="mt-6 text-7xl tracking-[0.2em]">{state.roomCode}</p>
            {qr && (
              <img src={qr} alt={`QR code to join room ${state.roomCode}`} className="mt-6 h-48 w-48" />
            )}
            <p className="mt-6 text-lg text-muted-foreground">Best with 3–6 people.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              They scan the code on your screen. Nothing to download.
            </p>

            <div className="mt-8 flex flex-col gap-1">
              {state.participants.map((p) => (
                <p key={p.participantId} className="text-lg">
                  {p.name}
                  {p.isMe ? " (you)" : ""}
                  {p.isHost ? " — running it" : ""}
                </p>
              ))}
            </div>

            {state.iAmHost && (
              <button
                disabled={busy}
                onClick={() => void run(() => begin({ data: { guestToken, sessionId } }))}
                className="btn-ink mt-10 self-start disabled:opacity-30"
              >
                Start — {state.total} questions
              </button>
            )}
            {!state.iAmHost && (
              <p className="mt-10 text-lg text-muted-foreground">Waiting for the first question…</p>
            )}
          </div>
        )}

        {(state.status === "answering" || state.status === "revealed") && current && (
          <div>
            <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">
              Question {state.currentIndex + 1} of {state.total}
            </p>
            {(() => {
              const imp = current.kind === "impression" ? current.impression : null;
              const pending = imp?.targets.find((t) => t.guessed === null) ?? null;
              const onSelf = Boolean(imp && !pending && !imp.selfAnswer);
              const myDone = imp ? imp.done : Boolean(current.myAnswer);
              const heading = current.revealed
                ? current.text
                : pending
                  ? pending.stem
                  : onSelf
                    ? imp!.selfStem
                    : current.text;

              return (
                <>
                  {!current.revealed && pending && (
                    <p className="mt-6 text-sm tracking-[0.18em] text-muted-foreground uppercase">
                      Guess:
                    </p>
                  )}
                  <div
                    className={
                      !current.revealed && onSelf
                        ? "mt-6 rounded-3xl border border-primary/40 bg-secondary px-6 py-6"
                        : ""
                    }
                  >
                    {!current.revealed && onSelf && (
                      <p className="text-sm tracking-[0.18em] text-primary uppercase">And you?</p>
                    )}
                    <h2
                      className={`text-4xl leading-tight ${
                        !current.revealed && (pending || onSelf) ? "mt-2" : "mt-6"
                      }`}
                    >
                      {imp && pending ? withName(heading, pending.name) : heading}
                    </h2>
                  </div>

                  {!current.revealed && state.iAmPlaying && !myDone && (
                    <div className="mt-10 flex flex-col gap-3">
                      {current.options.map((option) => (
                        <button
                          key={option.key}
                          disabled={busy}
                          onClick={() => {
                            track(
                              "answer_submitted",
                              {
                                session_question_id: current.sessionQuestionId,
                                option_key: option.key,
                                answer_role: pending ? "about_other" : "about_self",
                                kind: "group",
                                seconds: Math.round((Date.now() - shownAt.current) / 1000),
                              },
                              { sessionId },
                            );
                            void run(() =>
                              answer({
                                data: {
                                  guestToken,
                                  sessionQuestionId: current.sessionQuestionId,
                                  optionKey: option.key,
                                  ...(pending ? { aboutParticipantId: pending.participantId } : {}),
                                },
                              }),
                            );
                          }}
                          className="card-soft px-6 py-6 text-left text-xl hover:border-primary disabled:opacity-50"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {!current.revealed && state.iAmPlaying && myDone && (
                    <p className="mt-12 text-lg text-muted-foreground">That's yours.</p>
                  )}
                </>
              );
            })()}


            {!current.revealed && state.iAmHost && (
              <div className="mt-12">
                <p className="text-lg text-muted-foreground">
                  {current.answeredCount} of {state.playerCount} answered
                </p>
                <button
                  onClick={() => {
                    track(
                      "reveal_triggered",
                      {
                        session_question_id: current.sessionQuestionId,
                        answered: current.answeredCount,
                        players: state.playerCount,
                        kind: "group",
                      },
                      { sessionId },
                    );
                    void run(() => reveal({ data: { guestToken, sessionId } }));
                  }}
                  className="btn-ink mt-4 self-start"
                >
                  Reveal
                </button>
              </div>
            )}

            {current.revealed && current.kind === "impression" && current.impression && (
              <div className="mt-10 flex flex-col gap-6">
                <p className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
                  How the room read you
                </p>
                {current.impression.aboutMe.length === 0 ? (
                  <p className="text-2xl leading-snug">Nobody got to yours this time.</p>
                ) : (
                  current.impression.aboutMe.map((row) => (
                    <p key={row.name} className="text-2xl leading-snug">
                      {row.name} said {row.label}.
                    </p>
                  ))
                )}
                {current.impression.selfAnswer && (
                  <p className="text-2xl leading-snug text-primary">
                    You said{" "}
                    {current.options.find((o) => o.key === current.impression!.selfAnswer)?.label}.
                  </p>
                )}
                {state.iAmHost && (
                  <button
                    onClick={() => void run(() => next({ data: { guestToken, sessionId } }))}
                    className="btn-quiet mt-8 self-start"
                  >
                    Next question
                  </button>
                )}
              </div>
            )}

            {current.revealed && current.kind !== "impression" && (
              <div className="mt-10 flex flex-col gap-8">
                {[...current.options]
                  .sort((a, b) =>
                    a.key === current.minorityOption ? -1 : b.key === current.minorityOption ? 1 : 0,
                  )
                  .map((option) => {
                    const names = current.picks.filter((p) => p.optionKey === option.key);
                    const isMinority = option.key === current.minorityOption;
                    const isMajority = current.minorityOption !== null && !isMinority;
                    return (
                      <div key={option.key}>
                        {isMinority && (
                          <p className="mb-3 text-lg text-primary">
                            👀 {onlyLine(current.minorityNames)}
                          </p>
                        )}
                        <p
                          className={
                            isMinority
                              ? "text-4xl leading-tight text-primary"
                              : isMajority
                                ? "text-xl text-muted-foreground opacity-60"
                                : "text-2xl"
                          }
                        >
                          {option.label}
                        </p>
                        <p
                          className={
                            isMinority
                              ? "mt-3 text-3xl leading-snug text-primary"
                              : isMajority
                                ? "mt-2 text-base text-muted-foreground opacity-60"
                                : "mt-2 text-lg text-muted-foreground"
                          }
                        >
                          {names.length === 0
                            ? "Nobody"
                            : names.map((p) => (p.isMe ? "You" : p.name)).join(", ")}
                        </p>
                      </div>
                    );
                  })}
                {current.ask && <p className="text-2xl leading-snug">{current.ask}</p>}
                {state.iAmHost && (
                  <button
                    onClick={() => void run(() => next({ data: { guestToken, sessionId } }))}
                    className="btn-quiet mt-12 self-start"
                  >
                    Next question
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {state.status === "ended" && (
          <div>
            <h2 className="text-4xl leading-tight">
              {top && top.count > 0
                ? `You and ${top.name} disagreed on ${top.count} question${top.count === 1 ? "" : "s"} — more than anyone else here.`
                : "That's the session."}
            </h2>

            {top && top.count > 0 && top.topSessionQuestionId && (
              <div className="mt-8">
                {link ? (
                  <div>
                    <p className="text-lg">Send this to {top.name}:</p>
                    <p className="mt-2 break-all text-base text-muted-foreground">{link}</p>
                    <button
                      onClick={() => void navigator.clipboard.writeText(link)}
                      className="btn-quiet mt-4"
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => {
                      track(
                        "bridge_tapped",
                        { with_name: top.name, session_question_id: top.topSessionQuestionId },
                        { sessionId },
                      );
                      void run(async () => {
                        const result = await oneOnOne({
                          data: {
                            guestToken,
                            sessionId,
                            withParticipantId: top.participantId,
                            sessionQuestionId: top.topSessionQuestionId,
                          },
                        });
                        setLink(`${window.location.origin}/i/${result.token}`);
                      });
                    }}
                    className="btn-ink self-start disabled:opacity-30"
                  >
                    Keep going with {top.name}
                  </button>
                )}
              </div>
            )}

            {state.results.length > 0 && (
              <div className="mt-12 flex flex-col gap-8">
                <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">
                  Room {state.roomCode}
                </p>
                {state.results.map((question) => (
                  <div key={question.sessionQuestionId}>
                    <p className="text-2xl leading-snug">{question.text}</p>
                    {question.options.map((option) => (
                      <p key={option.key} className="mt-2 text-base text-muted-foreground">
                        {option.label} — {option.names.length ? option.names.join(", ") : "Nobody"}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {state.participants.some((p) => !p.isMe && p.connected) && (
              <div className="mt-12">
                <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">Added</p>
                <p className="mt-2 text-lg">
                  {state.participants
                    .filter((p) => !p.isMe && p.connected)
                    .map((p) => p.name)
                    .join(", ")}
                </p>
              </div>
            )}

          </div>
        )}
      </section>
    </main>
  );
}

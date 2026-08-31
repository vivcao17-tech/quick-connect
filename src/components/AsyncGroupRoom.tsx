import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { track } from "@/lib/track";

import { Thread } from "@/components/Thread";
import {
  answerInAsyncGroup,
  getAsyncGroupState,
  revealAsyncGroup,
  saveAsyncGroupEmail,
} from "@/lib/async-group.functions";
import { getGuestToken } from "@/lib/guest";
import type { OptionKey } from "@/lib/remote-shared";

type State = Awaited<ReturnType<typeof getAsyncGroupState>>;
type Loaded = Extract<State, { member: true }>;

export function AsyncGroupRoom({ sessionId }: { sessionId: string }) {
  const load = useServerFn(getAsyncGroupState);
  const answer = useServerFn(answerInAsyncGroup);
  const reveal = useServerFn(revealAsyncGroup);
  const saveEmail = useServerFn(saveAsyncGroupEmail);

  const [guestToken, setGuestToken] = useState("");
  const [state, setState] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [emailDone, setEmailDone] = useState(false);
  const [openQuestion, setOpenQuestion] = useState("");

  useEffect(() => setGuestToken(getGuestToken()), []);

  const refresh = useCallback(async () => {
    if (!guestToken) return;
    try {
      const result = await load({ data: { guestToken, sessionId } });
      if (!result.member) return setMissing(true);
      setState(result);
    } catch {
      setMissing(true);
    }
  }, [load, guestToken, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // One reveal per async room, so log it the first time it comes back open.
  const revealedNow = Boolean(state?.revealed);
  useEffect(() => {
    if (!revealedNow) return;
    track("reveal_shown", { kind: "group_async" }, { sessionId });
  }, [revealedNow, sessionId]);

  // While waiting, the only thing that can change is whether it's revealed yet.
  useEffect(() => {
    if (!state || state.revealed) return;
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [state, refresh]);

  if (missing) {
    return (
      <Shell>
        <p className="text-lg text-muted-foreground">This room isn't yours to open.</p>
        <Link to="/" className="mt-6 inline-block underline underline-offset-4">
          Home
        </Link>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <p className="text-lg text-muted-foreground">One moment…</p>
      </Shell>
    );
  }

  const next = state.questions.find((q) => !q.myAnswer);

  async function pick(sessionQuestionId: string, optionKey: OptionKey) {
    if (busy) return;
    setBusy(true);
    try {
      await answer({ data: { guestToken, sessionQuestionId, optionKey } });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (next && !state.revealed) {
    const position = state.questions.indexOf(next) + 1;
    return (
      <Shell>
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          {position} of {state.questions.length}
        </p>
        <h1 className="mt-8 text-4xl leading-tight">{next.text}</h1>
        <div className="mt-10 flex flex-col gap-3">
          {next.options.map((option) => (
            <button
              key={option.key}
              disabled={busy}
              onClick={() => {
                track(
                  "answer_submitted",
                  {
                    session_question_id: next.sessionQuestionId,
                    option_key: option.key,
                    answer_role: "about_self",
                    kind: "group_async",
                  },
                  { sessionId },
                );
                void pick(next.sessionQuestionId, option.key);
              }}
              className="card-soft px-6 py-6 text-left text-2xl hover:border-primary disabled:opacity-40"
            >
              {option.label}
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  if (!state.revealed) {
    return (
      <Shell>
        <h1 className="text-4xl leading-tight">
          {state.answeredPeople} of {state.totalPeople} have answered.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Nobody sees anything until it opens — {state.hoursLeft > 0 ? `at the latest in ${state.hoursLeft}h` : "any moment now"}.
        </p>

        {!state.hasEmail && !emailDone && (
          <div className="card-soft mt-10 px-6 py-6">
            <p className="text-xl">We'll tell you when everyone's in.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email"
                className="flex-1 rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              <button
                disabled={!email.includes("@")}
                onClick={() => {
                  track("email_captured", { where: "group_async_waiting" }, { sessionId });
                  void saveEmail({ data: { guestToken, sessionId, email } })
                    .then(() => setEmailDone(true))
                    .catch(() => undefined);
                }}
                className="btn-ink disabled:opacity-30"
              >
                Tell me
              </button>
            </div>
          </div>
        )}
        {(state.hasEmail || emailDone) && (
          <p className="mt-8 text-muted-foreground">We'll email you when it opens.</p>
        )}

        {state.isCreator && (
          <div className="mt-12 flex flex-col items-start gap-4 border-t border-border pt-8">
            <Link
              to="/gsend/$sessionId"
              params={{ sessionId }}
              className="underline underline-offset-4"
            >
              Add people / copy links
            </Link>
            <button
              onClick={() => {
                setBusy(true);
                track(
                  "reveal_triggered",
                  {
                    kind: "group_async",
                    answered: state.answeredPeople,
                    players: state.totalPeople,
                  },
                  { sessionId },
                );
                void reveal({ data: { guestToken, sessionId } })
                  .then(refresh)
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
              className="btn-ink disabled:opacity-40"
            >
              Open it now ({state.answeredPeople}/{state.totalPeople})
            </button>
          </div>
        )}
      </Shell>
    );
  }

  const open = state.blocks.find((block) => block.sessionQuestionId === openQuestion);

  if (open) {
    return (
      <main className="paper flex h-screen flex-col bg-background">
        {/* Sticky, and deliberately large: people come back days later. */}
        <header className="max-h-[38vh] shrink-0 overflow-y-auto border-b border-border bg-background px-6 pt-6 pb-5">
          <button
            onClick={() => setOpenQuestion("")}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            All questions
          </button>
          <h2 className="mt-3 text-2xl leading-snug">{open.text}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {open.options.map((option) => (
              <div
                key={option.key}
                className={`rounded-2xl border px-4 py-3 ${option.mine ? "border-primary" : "border-border"}`}
              >
                <p className="text-lg">{option.label}</p>
                <p className="mt-1 text-base text-muted-foreground">
                  {option.names.length ? option.names.join(", ") : "Nobody"}
                </p>
              </div>
            ))}
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Thread
            guestToken={guestToken}
            sessionQuestionId={open.sessionQuestionId}
            prompts={open.prompts}
            sessionId={sessionId}
            promptSource={open.prompts?.length ? "ai" : "template"}
          />
        </div>
      </main>
    );
  }

  return (
    <Shell>
      <h1 className="text-4xl leading-tight">Here's where everyone landed.</h1>
      <p className="mt-3 text-muted-foreground">
        {state.answeredPeople} of {state.totalPeople} answered. Tap a question to talk about it.
      </p>
      <div className="mt-10 flex flex-col gap-4">
        {state.blocks.map((block) => (
          <button
            key={block.sessionQuestionId}
            onClick={() => setOpenQuestion(block.sessionQuestionId)}
            className="card-soft px-6 py-5 text-left hover:border-primary"
          >
            <p className="text-xl leading-snug">{block.text}</p>
            <div className="mt-4 flex flex-col gap-2">
              {block.options.map((option) => (
                <p key={option.key} className="text-base">
                  <span className={option.names.length === 1 ? "text-primary" : ""}>
                    {option.label}
                  </span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {option.names.length ? option.names.join(", ") : "nobody"}
                  </span>
                </p>
              ))}
            </div>
          </button>
        ))}
      </div>
      {state.questions.some((q) => !q.myAnswer) && (
        <p className="mt-8 text-sm text-muted-foreground">
          You can still answer the rest — they'll show up here.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        {children}
      </section>
    </main>
  );
}

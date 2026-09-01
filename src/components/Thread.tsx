import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";

import { getThread, postThreadMessage } from "@/lib/remote.functions";
import { track } from "@/lib/track";

/** Closing reactions: tapping one posts instantly, because the point is that
    nothing more is required. */
const CLOSERS = ["👀", "😂"];

type Message = { id: string; kind: string; body: string; mine: boolean; who: string };
type Row = { message: Message; showIdentity: boolean; reactions: Message[] };

function initialOf(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export function Thread({
  guestToken,
  sessionQuestionId,
  prompts,
  extraPrompts,
  onPrompt,
  sessionId,
  revealedAt,
  promptSource,
  followUp,
  autoFocus,
  bare,
}: {
  guestToken: string;
  sessionQuestionId: string;
  /** Analytics only: which room this thread belongs to. */
  sessionId?: string | undefined;
  /** Analytics only: lets us measure reveal → first message. */
  revealedAt?: string | undefined;
  /** Analytics only: were these prompts written by the model or the template? */
  promptSource?: "ai" | "template" | undefined;
  prompts?: string[];
  /** Reason chips for this question: conversation starters, shown behind "More". */
  extraPrompts?: string[];
  /** The open-ended follow-up this thread was opened for, if any. Answering it
      once is what we measure: which questions actually get people typing. */
  followUp?: { questionId: string; text: string } | undefined;
  /** Put the cursor in the composer as soon as the thread appears. */
  autoFocus?: boolean | undefined;
  /** Question + messages + composer only: used by the follow-up screen. */
  bare?: boolean | undefined;
  onPrompt?: (prompt: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const lastCount = useRef(0);
  const settled = useRef(false);
  const sentRef = useRef(false);
  const followUpAnswered = useRef(false);

  const load = useServerFn(getThread);
  const post = useServerFn(postThreadMessage);

  // Poll so the other person's messages appear without a manual refresh.
  useEffect(() => {
    if (!guestToken || !sessionQuestionId) return;
    let alive = true;
    settled.current = false;
    lastCount.current = 0;
    const pull = () =>
      void load({ data: { guestToken, sessionQuestionId } })
        .then((result) => {
          if (!alive) return;
          setMessages(result.messages as Message[]);
          if (!settled.current) setFirstUnreadId(result.firstUnreadId ?? "");
        })
        .catch(() => undefined);
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [guestToken, sessionQuestionId, load]);

  /* Opening: land on the first unread line when there is one, otherwise stay at
     the top so the question and both answers are read first. After that, only a
     message I just sent, or a new arrival, pulls the view down. */
  useEffect(() => {
    if (messages.length === 0) return;
    if (!settled.current) {
      settled.current = true;
      lastCount.current = messages.length;
      if (firstUnreadId) {
        nodes.current.get(firstUnreadId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (messages.length > lastCount.current) {
      const target = sentRef.current
        ? nodes.current.get(messages[messages.length - 1]?.id ?? "")
        : undefined;
      (target ?? endRef.current)?.scrollIntoView({ behavior: "smooth", block: "end" });
      sentRef.current = false;
    }
    lastCount.current = messages.length;
  }, [messages, firstUnreadId]);

  // Opening straight into "spill the tea" should land on the keyboard.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [autoFocus, sessionQuestionId]);

  /** Two quick prompts up front; the reason chips live behind "More". */
  const allPrompts = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of [...(prompts ?? []), ...(extraPrompts ?? [])]) {
      const clean = item.trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }, [prompts, extraPrompts]);

  const shownRef = useRef("");
  useEffect(() => {
    if (allPrompts.length === 0) return;
    const key = `${sessionQuestionId}:${allPrompts.join("|")}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    track(
      "prompt_shown",
      { prompts: allPrompts.join(" | "), count: allPrompts.length, source: promptSource ?? "template" },
      { sessionId: sessionId ?? null },
    );
  }, [allPrompts, sessionQuestionId, promptSource, sessionId]);

  // Reactions ride in the right-hand gutter of the message they answer.
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const message of messages) {
      const previous = out[out.length - 1];
      if (message.kind === "reaction" && previous) {
        previous.reactions.push(message);
        continue;
      }
      out.push({
        message,
        showIdentity: !previous || previous.message.who !== message.who,
        reactions: [],
      });
    }
    return out;
  }, [messages]);

  async function send(kind: "reaction" | "text" | "quick_ask" | "starter", body: string) {
    const clean = body.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await post({ data: { guestToken, sessionQuestionId, kind, body: clean } });
      track(
        kind === "reaction" ? "reaction_sent" : "thread_message_sent",
        {
          kind,
          chars: clean.length,
          session_question_id: sessionQuestionId,
          seconds_since_reveal: revealedAt
            ? Math.round((Date.now() - new Date(revealedAt).getTime()) / 1000)
            : null,
        },
        { sessionId: sessionId ?? null },
      );
      if (kind === "text" && followUp && !followUpAnswered.current) {
        followUpAnswered.current = true;
        track(
          "follow_up_answered",
          {
            question_id: followUp.questionId,
            session_question_id: sessionQuestionId,
            follow_up: followUp.text,
            chars: clean.length,
          },
          { sessionId: sessionId ?? null },
        );
      }
      sentRef.current = true;
      const result = await load({ data: { guestToken, sessionQuestionId } });
      setMessages(result.messages as Message[]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  /** Put text in the box so it can be read, edited or deleted before sending. */
  function fillDraft(starter: string) {
    setDraft(starter);
    window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current?.focus();
      const end = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(end, end);
    }, 0);
  }

  const chip =
    "rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground";

  return (
    <div className="mt-8 border-t border-border pt-6">
      {rows.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.message.id}
              ref={(node) => {
                if (node) nodes.current.set(row.message.id, node);
              }}
              className="flex items-start gap-3"
            >
              <div className="w-8 shrink-0">
                {row.showIdentity && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm">
                    {initialOf(row.message.mine ? "You" : row.message.who)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {row.showIdentity && (
                  <p className="text-xs tracking-wide text-muted-foreground">
                    {row.message.mine ? "You" : row.message.who}
                  </p>
                )}
                <p className="text-base">{row.message.body}</p>
              </div>
              <div className="flex w-20 shrink-0 flex-wrap justify-end gap-1">
                {row.reactions.map((reaction) => (
                  <span
                    key={reaction.id}
                    title={`${reaction.mine ? "You" : reaction.who}: ${reaction.body}`}
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {reaction.body}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Closing reactions sit with the messages, not with the composer. */}
      <div className={`mb-8 ${bare ? "hidden" : ""}`}>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted-foreground uppercase">
          No reply needed
        </p>
        <div className="flex flex-wrap gap-2">
          {CLOSERS.map((closer) => (
            <button
              key={closer}
              disabled={busy}
              onClick={() => void send("reaction", closer)}
              className="rounded-full border border-border px-4 py-2 text-lg disabled:opacity-40"
            >
              {closer}
            </button>
          ))}
        </div>
      </div>

      {/* Continuation prompts: specific to this question, tapped into the box. */}
      {!bare && allPrompts.length > 0 && (
        <div className="rounded-2xl bg-secondary/40 px-4 py-4">
          <p className="mb-3 text-xs tracking-[0.18em] text-muted-foreground uppercase">
            {rows.length === 0 ? "Want to ask why?" : "Tap to start a reply"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(showAll ? allPrompts : allPrompts.slice(0, 2)).map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  track(
                    "prompt_tapped",
                    { prompt, source: promptSource ?? "template", session_question_id: sessionQuestionId },
                    { sessionId: sessionId ?? null },
                  );
                  onPrompt?.(prompt);
                  fillDraft(prompt);
                }}
                className={chip}
              >
                {prompt}
              </button>
            ))}
            {allPrompts.length > 2 && (
              <button
                onClick={() => setShowAll((open) => !open)}
                className="rounded-full px-3 py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {showAll ? "Less" : "More"}
              </button>
            )}
          </div>
        </div>
      )}


      <div ref={endRef} className="h-px" />

      {/* Composer — anchored at the bottom of the thread view */}
      <form
        className="sticky bottom-0 z-10 mt-7 flex gap-2 border-t border-border bg-background pt-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send("text", draft);
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say one thing"
          className="w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="btn-quiet shrink-0 hover:bg-secondary disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

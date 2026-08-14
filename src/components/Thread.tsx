import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { getThread, postThreadMessage } from "@/lib/remote.functions";

const REACTIONS = ["Called it", "Seriously?", "Tell me more"];
const QUICK_ASKS = ["Has that always been true?", "What changed?", "Would you do it again?"];
const STARTERS = [
  "I picked that because last time ",
  "I almost went your way because ",
  "The thing I didn't say is ",
];

type Message = { id: string; kind: string; body: string; mine: boolean; who: string };

export function Thread({
  guestToken,
  sessionQuestionId,
  prompts,
  onPrompt,
}: {
  guestToken: string;
  sessionQuestionId: string;
  prompts?: string[];
  onPrompt?: (prompt: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useServerFn(getThread);
  const post = useServerFn(postThreadMessage);

  // Poll so the other person's messages appear without a manual refresh.
  useEffect(() => {
    if (!guestToken || !sessionQuestionId) return;
    let alive = true;
    const pull = () =>
      void load({ data: { guestToken, sessionQuestionId } })
        .then((result) => {
          if (alive) setMessages(result.messages as Message[]);
        })
        .catch(() => undefined);
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [guestToken, sessionQuestionId, load]);

  // Keep the newest message just above the composer, like a chat app.
  useEffect(() => {
    if (messages.length > lastCount.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    lastCount.current = messages.length;
  }, [messages]);


  async function send(kind: "reaction" | "text" | "quick_ask" | "starter", body: string) {
    const clean = body.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await post({ data: { guestToken, sessionQuestionId, kind, body: clean } });
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
      {messages.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {messages.map((message) => (
            <p key={message.id} className="text-base">
              <span className="text-muted-foreground">{message.mine ? "You" : message.who}: </span>
              {message.body}
            </p>
          ))}
        </div>
      )}

      {messages.length === 0 && <p className="mb-4 text-lg">Want to ask why?</p>}

      {prompts && prompts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                onPrompt?.(prompt);
                fillDraft(prompt);
              }}
              className={chip}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {REACTIONS.map((reaction) => (
          <button
            key={reaction}
            disabled={busy}
            onClick={() => send("reaction", reaction)}
            className={`${chip} disabled:opacity-40`}
          >
            {reaction}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ASKS.map((ask) => (
          <button key={ask} onClick={() => fillDraft(ask)} className={chip}>
            {ask}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STARTERS.map((starter) => (
          <button key={starter} onClick={() => fillDraft(starter)} className={chip}>
            {starter}___
          </button>
        ))}
      </div>


      <form
        className="mt-4 flex gap-2"
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

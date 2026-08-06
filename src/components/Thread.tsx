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
}: {
  guestToken: string;
  sessionQuestionId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useServerFn(getThread);
  const post = useServerFn(postThreadMessage);

  useEffect(() => {
    if (!guestToken || !sessionQuestionId) return;
    void load({ data: { guestToken, sessionQuestionId } }).then((result) =>
      setMessages(result.messages as Message[]),
    );
  }, [guestToken, sessionQuestionId, load]);

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

  function useStarter(starter: string) {
    setDraft(starter);
    window.setTimeout(() => {
      inputRef.current?.focus();
      const end = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(end, end);
    }, 0);
  }

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

      <div className="flex flex-wrap gap-2">
        {REACTIONS.map((reaction) => (
          <button
            key={reaction}
            disabled={busy}
            onClick={() => send("reaction", reaction)}
            className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary disabled:opacity-40"
          >
            {reaction}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ASKS.map((ask) => (
          <button
            key={ask}
            disabled={busy}
            onClick={() => send("quick_ask", ask)}
            className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-40"
          >
            {ask}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            onClick={() => useStarter(starter)}
            className="text-sm text-muted-foreground italic underline underline-offset-4 hover:text-foreground"
          >
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

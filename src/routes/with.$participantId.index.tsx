import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  answerInConversation,
  getConversation,
  getConversationPrompt,
  postConversationMessage,
  type TimelineItem,
  type TimelineQuestion,
} from "@/lib/conversation.functions";
import { postThreadMessage } from "@/lib/remote.functions";
import { track } from "@/lib/track";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/with/$participantId/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] as string } : {},
  component: ConversationPage,
  head: () => ({
    meta: [
      { title: "Your conversation — NoSure" },
      {
        name: "description",
        content: "Every question you two have answered and everything you said after, in order.",
      },
      { property: "og:title", content: "Your conversation — NoSure" },
      {
        property: "og:description",
        content: "Every question you two have answered and everything you said after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Q = TimelineQuestion["data"];

function colorFor(name: string) {
  let total = 0;
  for (const letter of name) total = (total * 31 + (letter.codePointAt(0) ?? 0)) % 6;
  return `var(--code-ink-${total + 1})`;
}

function merge(current: TimelineItem[], incoming: TimelineItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
}

function ConversationPage() {
  const { participantId } = Route.useParams();
  const { q } = Route.useSearch();
  const viewer = useViewer();
  const navigate = useNavigate();

  const load = useServerFn(getConversation);
  const post = useServerFn(postThreadMessage);
  const postLoose = useServerFn(postConversationMessage);
  const answer = useServerFn(answerInConversation);
  const loadPrompt = useServerFn(getConversationPrompt);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [header, setHeader] = useState({ line: "", next: "click" });
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState("");
  const [talkOpen, setTalkOpen] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  const keepOffset = useRef<number | null>(null);

  const identity = useCallback(
    () => ({
      guestToken: viewer.guestToken,
      ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
    }),
    [viewer.guestToken, viewer.profileId],
  );

  const refresh = useCallback(async () => {
    if (!viewer.guestToken) return;
    const result = await load({
      data: { ...identity(), personKey: participantId, ...(q ? { focus: q } : {}) },
    });
    setName(result.name);
    setHeader(result.header);
    setItems((current) => merge(current, result.items));
    if (!settled.current) setHasMore(result.hasMore);
    setLoaded(true);
    if (result.personKey && result.personKey !== participantId) {
      void navigate({
        to: "/with/$participantId",
        params: { participantId: result.personKey },
        search: q ? { q } : {},
        replace: true,
      });
    }
  }, [identity, load, navigate, participantId, q, viewer.guestToken]);

  useEffect(() => {
    if (!viewer.ready) return;
    void refresh().catch(() => setLoaded(true));
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [viewer.ready, refresh]);

  // First paint: land on ?q= (briefly highlighted), otherwise the bottom.
  useEffect(() => {
    if (!loaded || settled.current) return;
    settled.current = true;
    window.setTimeout(() => {
      if (q) {
        const node = document.getElementById(`q-${q}`);
        if (node) {
          node.scrollIntoView({ block: "center" });
          setHighlight(q);
          window.setTimeout(() => setHighlight(""), 2200);
          return;
        }
      }
      window.scrollTo({ top: document.body.scrollHeight });
    }, 0);
  }, [loaded, q]);

  // New arrivals at the bottom pull the view down only if you're already near it.
  const lastId = items[items.length - 1]?.id;
  useEffect(() => {
    if (!settled.current || !lastId) return;
    const nearBottom = window.innerHeight + window.scrollY > document.body.scrollHeight - 240;
    if (nearBottom) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [lastId]);

  // Older items: keep the reader's place when they're prepended.
  useLayoutEffect(() => {
    if (keepOffset.current === null) return;
    window.scrollTo({ top: document.body.scrollHeight - keepOffset.current });
    keepOffset.current = null;
  }, [items]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !items[0]) return;
    setLoadingOlder(true);
    try {
      const result = await load({
        data: { ...identity(), personKey: participantId, before: items[0].timestamp },
      });
      keepOffset.current = document.body.scrollHeight - window.scrollY;
      setItems((current) => merge(current, result.items));
      setHasMore(result.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, identity, items, load, loadingOlder, participantId]);

  useEffect(() => {
    const node = topRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && settled.current) void loadOlder();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadOlder]);

  const questions = items.filter((i): i is TimelineQuestion => i.type === "question");
  // Only a Talk tap attaches a question; otherwise the message stands alone.
  const targetQ = questions.find((i) => i.data.sessionQuestionId === target)?.data;
  const display = name || "them";

  function fill(text: string, sessionQuestionId?: string) {
    setTarget(sessionQuestionId ?? "");
    setDraft(text);
    window.setTimeout(() => {
      inputRef.current?.focus();
      const end = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(end, end);
    }, 0);
  }

  async function send(kind: "text" | "reaction", body: string) {
    const clean = body.trim();
    if (!clean || busy || !viewer.guestToken) return;
    setBusy(true);
    try {
      if (targetQ) {
        await post({
          data: { ...identity(), sessionQuestionId: targetQ.sessionQuestionId, kind, body: clean },
        });
      } else {
        await postLoose({ data: { ...identity(), personKey: participantId, kind, body: clean } });
      }
      track(kind === "reaction" ? "reaction_sent" : "thread_message_sent", {
        kind,
        chars: clean.length,
        session_question_id: targetQ?.sessionQuestionId ?? null,
        surface: "conversation",
      });
      if (kind === "text") {
        setDraft("");
        setTarget("");
      }
      await refresh();
      window.setTimeout(
        () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
        50,
      );
    } finally {
      setBusy(false);
    }
  }

  async function pick(question: Q, optionKey: string) {
    if (busy) return;
    setBusy(true);
    try {
      await answer({
        data: {
          ...identity(),
          sessionQuestionId: question.sessionQuestionId,
          optionKey: optionKey as "a" | "b" | "c",
          ...(question.kind === "impression" && question.needs
            ? { answerRole: question.needs }
            : {}),
        },
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function somethingToTalkAbout() {
    setMenuOpen(false);
    const result = await loadPrompt({ data: { pack: null } });
    fill(result.text);
  }

  return (
    <main className="paper min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link
            to="/people"
            aria-label="Back to People"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-muted-foreground hover:bg-secondary"
          >
            ←
          </Link>
          <Link
            to="/with/$participantId/about"
            params={{ participantId }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-background"
              style={{ backgroundColor: name ? colorFor(name) : "var(--muted)" }}
            >
              {(name.trim()[0] ?? "").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg leading-tight">{name || " "}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {header.line ? `${header.line} ›` : " "}
              </span>
            </span>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-4 pt-4 pb-40">
        <div ref={topRef} className="h-px" />
        {hasMore && (
          <button
            onClick={() => void loadOlder()}
            className="mx-auto mb-4 block text-sm text-muted-foreground underline underline-offset-4"
          >
            {loadingOlder ? "Loading…" : "Earlier"}
          </button>
        )}

        {!loaded && (
          <div className="flex flex-col gap-3" aria-hidden>
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-24 animate-pulse rounded-2xl bg-secondary/60" />
            ))}
          </div>
        )}

        {loaded && items.length === 0 && (
          <p className="mt-10 text-center text-muted-foreground">
            Nothing between you yet. Tap + to send {display} three questions.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.type === "question" ? (
              <QuestionCard
                key={item.id}
                q={item.data}
                name={display}
                highlighted={highlight === item.data.sessionQuestionId}
                talkOpen={talkOpen === item.data.sessionQuestionId}
                busy={busy}
                onToggleTalk={() =>
                  setTalkOpen((open) =>
                    open === item.data.sessionQuestionId ? "" : item.data.sessionQuestionId,
                  )
                }
                onFill={(text) => fill(text, item.data.sessionQuestionId)}
                onSimilar={async () => {
                  const result = await loadPrompt({ data: { pack: item.data.pack } });
                  fill(result.text, item.data.sessionQuestionId);
                }}
                onPick={(key) => void pick(item.data, key)}
              />
            ) : item.type === "message" ? (
              <Bubble
                key={item.id}
                body={item.data.body}
                mine={item.data.mine}
                kind={item.data.kind}
                quote={item.data.quote.replaceAll("{name}", display)}
              />
            ) : (
              <p key={item.id} className="py-2 text-center text-xs text-muted-foreground">
                {item.data.text}
              </p>
            ),
          )}
        </div>
      </section>

      {/* Rendered before anything loads: the bar is the page's first job. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {menuOpen && (
          <div className="mx-auto flex max-w-xl flex-col gap-1 px-4 pt-3">
            <Link
              to="/remote"
              search={{ person: participantId }}
              className="rounded-xl px-4 py-3 text-left hover:bg-secondary"
            >
              <span className="block text-base">Ask three</span>
              <span className="block text-sm text-muted-foreground">
                Pick a pack and send {display} three questions
              </span>
            </Link>
            <button
              onClick={() => void somethingToTalkAbout()}
              className="rounded-xl px-4 py-3 text-left hover:bg-secondary"
            >
              <span className="block text-base">Something to talk about</span>
              <span className="block text-sm text-muted-foreground">
                Puts a prompt in the box — nothing is sent
              </span>
            </button>
          </div>
        )}
        {targetQ && (
          <div className="mx-auto flex max-w-xl items-center gap-2 px-4 pt-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate border-l-2 border-border pl-2">
              {targetQ.text.replaceAll("{name}", display)}
            </span>
            <button
              type="button"
              aria-label="Don't attach this question"
              onClick={() => setTarget("")}
              className="px-2 text-base"
            >
              ×
            </button>
          </div>
        )}
        <form
          className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send("text", draft);
          }}
        >
          <button
            type="button"
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-2xl hover:border-primary"
          >
            {menuOpen ? "×" : "+"}
          </button>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${display}`}
            className="min-w-0 flex-1 rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
          />
          {draft.trim() ? (
            <button
              type="submit"
              disabled={busy}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground disabled:opacity-40"
            >
              →
            </button>
          ) : (
            <button
              type="button"
              title="No reply needed"
              aria-label="No reply needed"
              disabled={busy}
              onClick={() => void send("reaction", "👀")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-xl disabled:opacity-40"
            >
              👀
            </button>
          )}
        </form>
      </div>
    </main>
  );
}

function Bubble({
  body,
  mine,
  kind,
  quote,
}: {
  body: string;
  mine: boolean;
  kind: string;
  quote: string;
}) {
  const quoted = quote ? (
    <span
      className={`mb-1 block max-w-[80%] truncate border-l-2 border-border pl-2 text-xs text-muted-foreground ${
        mine ? "ml-auto" : ""
      }`}
    >
      {quote}
    </span>
  ) : null;
  if (kind === "reaction") {
    return (
      <div className={mine ? "text-right" : "text-left"}>
        {quoted}
        <p className="text-2xl">{body}</p>
      </div>
    );
  }
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {quoted}
      <p
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-base ${
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary"
        }`}
      >
        {body}
      </p>
    </div>
  );
}

function QuestionCard({
  q,
  name,
  highlighted,
  talkOpen,
  busy,
  onToggleTalk,
  onFill,
  onSimilar,
  onPick,
}: {
  q: Q;
  name: string;
  highlighted: boolean;
  talkOpen: boolean;
  busy: boolean;
  onToggleTalk: () => void;
  onFill: (text: string) => void;
  onSimilar: () => void;
  onPick: (key: string) => void;
}) {
  const withName = (text: string) => text.replaceAll("{name}", name);
  const prompt =
    q.state === "waiting_me" && q.kind === "impression"
      ? withName((q.needs === "about_other" ? q.stemOther : q.stemSelf) || q.text)
      : withName(q.text);
  const chip =
    "rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground";

  return (
    <article
      id={`q-${q.sessionQuestionId}`}
      className={`card-soft scroll-mt-24 px-5 py-4 transition-shadow duration-700 ${
        highlighted ? "ring-2 ring-primary" : ""
      }`}
    >
      <p className="text-lg leading-snug">{prompt}</p>

      {q.state === "waiting_them" && (
        <p className="mt-3 text-sm text-muted-foreground italic">Waiting for {name}</p>
      )}

      {q.state === "waiting_me" && (
        <div className="mt-4 flex flex-col gap-2">
          {q.options.map((option) => (
            <button
              key={option.key}
              disabled={busy}
              onClick={() => onPick(option.key)}
              className="rounded-xl border border-border px-4 py-3 text-left text-base hover:border-primary disabled:opacity-40"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {q.state === "revealed" && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">You</p>
              <p className="text-base">{q.myLabel || "—"}</p>
              {q.myReason && (
                <p className="mt-1 text-sm text-muted-foreground italic">"{q.myReason}"</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className={`text-base ${q.matched === false ? "text-primary" : ""}`}>
                {q.theirLabel || "—"}
              </p>
              {q.theirReason && (
                <p className="mt-1 text-sm text-muted-foreground italic">"{q.theirReason}"</p>
              )}
            </div>
          </div>
          {(q.myGuess || q.theirGuess) && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
              <p>
                You guessed {name}: {q.myGuess || "—"}
              </p>
              <p>
                {name} guessed you: {q.theirGuess || "—"}
              </p>
            </div>
          )}
          <button
            onClick={onToggleTalk}
            aria-expanded={talkOpen}
            className="mt-4 text-sm text-primary underline underline-offset-4"
          >
            Talk
          </button>
          {talkOpen && (
            <div className="mt-3 flex flex-wrap gap-2">
              {q.matched === false && (
                <button className={chip} onClick={() => onFill(`Wait, why "${q.theirLabel}"?`)}>
                  Ask why
                </button>
              )}
              {q.matched === true && (
                <button className={chip} onClick={() => onFill("Same. For me it's because…")}>
                  Tell them yours
                </button>
              )}
              <button
                className={chip}
                onClick={() => onFill(q.followUp || "What's the story behind that?")}
              >
                Spill the tea
              </button>
              <button className={chip} onClick={onSimilar}>
                Similar questions
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

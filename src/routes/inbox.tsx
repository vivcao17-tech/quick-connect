import { createFileRoute, Link } from "@tanstack/react-router";

import { track } from "@/lib/track";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { PairSummary } from "@/components/PairSummary";
import { useViewer } from "@/lib/viewer";
import { getInbox } from "@/lib/remote.functions";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search["q"];
    return typeof q === "string" && q ? { q } : {};
  },
  head: () => ({
    meta: [
      { title: "Who answered you — NoSure" },
      {
        name: "description",
        content: "Everyone you sent three questions to, and what came back from each of them.",
      },
      { property: "og:title", content: "Who answered you — NoSure" },
      { property: "og:description", content: "Everyone you sent questions to, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Who answered you — NoSure" },
      { name: "twitter:description", content: "Everyone you sent questions to, in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Inbox = Awaited<ReturnType<typeof getInbox>>;
type Recipient = Inbox["sets"][number]["recipients"][number];

function InboxPage() {
  const { q } = Route.useSearch();
  const viewer = useViewer();
  const guestToken = viewer.guestToken;
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState<Recipient | null>(null);
  const [deepQuestion, setDeepQuestion] = useState(q ?? "");

  const load = useServerFn(getInbox);

  const refresh = useCallback(
    (token: string, profileId?: string) =>
      load({ data: { guestToken: token, ...(profileId ? { profileId } : {}) } })
        .then(setInbox)
        .catch(() => setInbox({ sets: [] })),
    [load],
  );

  useEffect(() => {
    if (!viewer.ready || !guestToken) return;
    void refresh(guestToken, viewer.profileId);
  }, [refresh, viewer.ready, viewer.profileId, guestToken]);

  // A notification link points at one question — open that pair straight away.
  useEffect(() => {
    if (!q) return;
    track("notification_clicked", { session_question_id: q, surface: "inbox" });
  }, [q]);

  useEffect(() => {
    if (!q || !inbox || open) return;
    for (const set of inbox.sets) {
      const match = set.recipients.find((r) => r.questionIds.includes(q));
      if (match) {
        setOpen(match);
        setDeepQuestion(q);
        return;
      }
    }
  }, [q, inbox, open]);

  const everyone = (inbox?.sets ?? []).flatMap((set) => set.recipients);

  if (open && open.childSessionId && guestToken) {
    return (
      <main className="paper min-h-screen bg-background">
        <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
          <button
            onClick={() => {
              setOpen(null);
              setDeepQuestion("");
              void refresh(guestToken);
            }}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Everyone
          </button>
          <div className="mt-8">
            <PairSummary
              guestToken={guestToken}
              sessionId={open.childSessionId}
              title={`You and ${open.label}`}
              initialQuestionId={deepQuestion}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">Who you asked</h1>

        {inbox && everyone.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">
            Nothing out there yet.{" "}
            <Link to="/remote" className="underline underline-offset-4">
              Send someone three questions.
            </Link>
          </p>
        )}

        <div className="mt-10 flex flex-col gap-4">
          {everyone.map((recipient) => (
            <button
              key={recipient.token}
              disabled={!recipient.childSessionId}
              onClick={() => setOpen(recipient)}
              className="card-soft px-6 py-5 text-left disabled:opacity-60"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-2xl">{recipient.label}</p>
                {recipient.unread > 0 && (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                    new
                  </span>
                )}
              </div>
              <p className="mt-2 text-base text-muted-foreground">
                {recipient.answered
                  ? recipient.differed === 0
                    ? "Answered — you two lined up on everything"
                    : `Answered — ${recipient.differed} ${
                        recipient.differed === 1 ? "answer" : "answers"
                      } apart`
                  : recipient.childSessionId
                    ? "Started, not finished"
                    : "Hasn't opened it yet"}
              </p>
            </button>
          ))}
        </div>

        <Link
          to="/"
          className="mt-12 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Home
        </Link>
      </section>
    </main>
  );
}

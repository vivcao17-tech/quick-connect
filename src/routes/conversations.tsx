import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { listConversations } from "@/lib/conversations.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/conversations")({
  component: ConversationsPage,
  head: () => ({
    meta: [
      { title: "People you've talked to — Beside" },
      {
        name: "description",
        content: "Everyone you've answered questions with, and the last thing you talked about.",
      },
      { property: "og:title", content: "People you've talked to — Beside" },
      {
        property: "og:description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "People you've talked to — Beside" },
      {
        name: "twitter:description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Result = Awaited<ReturnType<typeof listConversations>>;
type People = Result["people"];
type Waiting = Result["waiting"];

/** "2 days ago" without turning the page into a dashboard. */
function whenSent(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function ConversationsPage() {
  const [people, setPeople] = useState<People | null>(null);
  const [waiting, setWaiting] = useState<Waiting>([]);
  const [copied, setCopied] = useState("");
  const load = useServerFn(listConversations);
  const viewer = useViewer();

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void load({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then((result) => {
        setPeople(result.people);
        setWaiting(result.waiting);
      })
      .catch(() => setPeople([]));
  }, [load, viewer.ready, viewer.guestToken, viewer.profileId]);

  async function copyLink(token: string, note: string) {
    const message = `${note ? `${note}\n\n` : ""}3 questions · 30 seconds · no signup\n${window.location.origin}/i/${token}`;
    await navigator.clipboard.writeText(message);
    setCopied(token);
    window.setTimeout(() => setCopied(""), 2500);
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        {waiting.length > 0 && (
          <div className="mb-14">
            <h2 className="text-2xl leading-tight">Waiting on them</h2>
            <div className="mt-5 flex flex-col gap-3">
              {waiting.map((invite) => (
                <div key={invite.token} className="card-soft px-6 py-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-xl">{invite.label}</p>
                    <p className="text-sm text-muted-foreground">{whenSent(invite.sentAt)}</p>
                  </div>
                  <p className="mt-1 text-base text-muted-foreground">
                    {invite.opened ? "Opened your link" : "Hasn't opened it yet"}
                  </p>
                  <button
                    onClick={() => void copyLink(invite.token, invite.note)}
                    className="btn-quiet mt-4 hover:bg-secondary"
                  >
                    {copied === invite.token ? "Copied" : "Copy message + link"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h1 className="text-4xl leading-tight">People</h1>

        {people && people.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">
            {waiting.length > 0 ? (
              "Nobody's answered yet."
            ) : (
              <>
                Nobody yet.{" "}
                <Link to="/remote" className="underline underline-offset-4">
                  Send someone three questions.
                </Link>
              </>
            )}
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          {(people ?? []).map((person) => (
            <Link
              key={person.personKey}
              to="/with/$participantId"
              params={{ participantId: person.personKey }}
              className="card-soft block px-6 py-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-2xl">{person.name}</p>
                {person.unread > 0 && (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                    new
                  </span>
                )}
              </div>
              <p className="mt-2 text-base text-muted-foreground">{person.latestQuestion}</p>
            </Link>
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

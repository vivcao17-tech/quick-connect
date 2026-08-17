import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { listConversations } from "@/lib/conversations.functions";
import { getGuestToken } from "@/lib/guest";

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

type People = Awaited<ReturnType<typeof listConversations>>["people"];

function ConversationsPage() {
  const [people, setPeople] = useState<People | null>(null);
  const load = useServerFn(listConversations);

  useEffect(() => {
    const token = getGuestToken();
    if (!token) return;
    void load({ data: { guestToken: token } })
      .then((result) => setPeople(result.people))
      .catch(() => setPeople([]));
  }, [load]);

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">People</h1>

        {people && people.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">
            Nobody yet.{" "}
            <Link to="/remote" className="underline underline-offset-4">
              Send someone three questions.
            </Link>
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

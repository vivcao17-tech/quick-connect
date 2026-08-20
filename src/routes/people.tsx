import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { listPeople } from "@/lib/conversations.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/people")({
  component: PeoplePage,
  head: () => ({
    meta: [
      { title: "People — NoSure" },
      {
        name: "description",
        content: "Everyone you've answered questions with, and everyone you've added.",
      },
      { property: "og:title", content: "People — NoSure" },
      {
        property: "og:description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "People — NoSure" },
      {
        name: "twitter:description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type People = Awaited<ReturnType<typeof listPeople>>["people"];

function PeoplePage() {
  const [people, setPeople] = useState<People | null>(null);
  const load = useServerFn(listPeople);
  const viewer = useViewer();

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void load({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then((result) => setPeople(result.people))
      .catch(() => setPeople([]));
  }, [viewer.ready, viewer.guestToken, viewer.profileId, load]);

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-4xl">People</h1>

        {people === null && <p className="mt-8 text-lg text-muted-foreground">One second…</p>}

        {people?.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">
            Nobody yet. Start something and they'll show up here.
          </p>
        )}

        <div className="mt-10 flex flex-col">
          {(people ?? []).map((person) => (
            <Link
              key={person.personKey}
              to="/with/$participantId"
              params={{ participantId: person.personKey }}
              className="flex items-baseline justify-between gap-4 border-b border-border py-5"
            >
              <span className="text-2xl">{person.name}</span>
              <span className="flex items-center gap-3 text-sm text-muted-foreground">
                {person.met}
                {person.unread > 0 && (
                  <span aria-label="unread replies" className="h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
            </Link>
          ))}
        </div>

        <Link
          to="/"
          className="mt-14 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Back
        </Link>
      </section>
    </main>
  );
}

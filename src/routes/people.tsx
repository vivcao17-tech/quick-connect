import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { listPeople } from "@/lib/conversations.functions";
import { getWallLinks } from "@/lib/profile.functions";
import { ago } from "@/routes/with.$participantId.index";
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
  const [walls, setWalls] = useState<Record<string, string>>({});
  const load = useServerFn(listPeople);
  const loadWalls = useServerFn(getWallLinks);
  const viewer = useViewer();

  // Seeing how others read someone is the strongest pull toward your own wall.
  useEffect(() => {
    if (!people || people.length === 0) return;
    void loadWalls({ data: { personKeys: people.map((p) => p.personKey) } })
      .then((result) => setWalls(result.walls))
      .catch(() => setWalls({}));
  }, [people, loadWalls]);

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
            <div key={person.personKey} className="border-b border-border py-5">
              <Link
                to="/with/$participantId"
                params={{ participantId: person.personKey }}
                className="flex items-start justify-between gap-4"
              >
                <span className="min-w-0">
                  <span className="block text-2xl">{person.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {[
                      person.met,
                      person.sessionsLabel,
                      person.lastActivity ? `Last talked ${ago(person.lastActivity)}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {person.note && (
                    <span className="mt-1 block text-sm text-muted-foreground italic">
                      {person.note}
                    </span>
                  )}
                </span>
                {person.unread > 0 && (
                  <span
                    aria-label="unread replies"
                    className="mt-3 h-2 w-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </Link>
              {walls[person.personKey] && (
                <Link
                  to="/p/$handle"
                  params={{ handle: walls[person.personKey] as string }}
                  className="mt-2 inline-block text-base text-primary underline underline-offset-4"
                >
                  How people read {person.name}
                </Link>
              )}
            </div>
          ))}
        </div>

        {viewer.ready && !viewer.profileId && (
          <div className="mt-14 max-w-xs">
            <GoogleSignIn redirectPath="/people" />
            <p className="mt-3 text-sm text-muted-foreground">
              Keeps your answers if you switch phones.{" "}
              <Link
                to="/auth"
                search={{ redirect: "/people" }}
                className="underline underline-offset-4"
              >
                or use email
              </Link>
            </p>
          </div>
        )}

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

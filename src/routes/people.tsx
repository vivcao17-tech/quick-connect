import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { AppTabs } from "@/components/AppTabs";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { listPeople } from "@/lib/conversations.functions";
import { getMyImpressions } from "@/lib/know.functions";
import { readLocalViewer, useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/people")({
  component: PeoplePage,
  head: () => ({
    meta: [
      { title: "People — NoSure" },
      {
        name: "description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { property: "og:title", content: "People — NoSure" },
      {
        property: "og:description",
        content: "Everyone you've answered questions with, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Row = Awaited<ReturnType<typeof listPeople>>["people"][number];
type People = Row[];

function colorFor(name: string) {
  let total = 0;
  for (const letter of name) total = (total * 31 + (letter.codePointAt(0) ?? 0)) % 6;
  return `var(--code-ink-${total + 1})`;
}

function PeoplePage() {
  const [people, setPeople] = useState<People | null>(null);
  const [statuses, setStatuses] = useState<Map<string, string> | null>(null);
  const loadFull = useServerFn(listPeople);
  const viewer = useViewer();

  // Starts on mount from the locally stored session — no auth round trip first.
  // Names arrive from the light query; status lines fill in from the full one.
  useEffect(() => {
    let alive = true;
    void readLocalViewer().then((who) => {
      if (!alive) return;
      // Only the full read can exclude impression-card-only identities.
      void loadFull({ data: who })
        .then((result) => {
          if (!alive) return;
          setPeople(result.people);
          setStatuses(new Map(result.people.map((row) => [row.personKey, row.status])));
        })
        .catch(() => alive && setStatuses(new Map()));
    });
    return () => {
      alive = false;
    };
  }, [loadFull]);

  const sorted = useMemo(
    () => [...(people ?? [])].sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1)),
    [people],
  );
  const signedIn = viewer.ready && Boolean(viewer.profileId);

  return (
    <main className="paper min-h-screen bg-background pb-32">
      <section className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
              no<span className="text-primary">/</span>sure
            </p>
            <h1 className="mt-3 text-5xl leading-none">People</h1>
          </div>
        </header>


        {people === null && (
          <div aria-busy="true" aria-label="Loading people" className="mt-10 flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border py-5">
                <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1">
                  <span className="block h-6 w-32 animate-pulse rounded bg-muted" />
                  <span className="mt-2 block h-4 w-48 animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        )}

        {people?.length === 0 && (
          <div className="mt-24 text-center">
            <p className="text-lg text-muted-foreground">
              Your existing conversations will stay here.
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col">
          {sorted.map((person) => {
            const displayName = person.nickname || person.name || "Someone";
            return (
              <Link
                key={person.personKey}
                to="/with/$participantId"
                params={{ participantId: person.personKey }}
                className="group flex min-w-0 items-center gap-4 border-b border-border py-5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-primary-foreground"
                  style={{ backgroundColor: colorFor(displayName) }}
                >
                  {displayName.trim().charAt(0).toLocaleUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xl leading-tight">{displayName}</span>
                  {(statuses?.get(person.personKey) ?? person.status) ? (
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {statuses?.get(person.personKey) ?? person.status}
                    </span>
                  ) : (
                    <span className="mt-2 block h-4 w-40 animate-pulse rounded bg-muted" />
                  )}
                </span>
                {person.unread > 0 && (
                  <span
                    aria-label="New activity"
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
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
      </section>

      <AppTabs deferChecks={people === null} />
    </main>
  );
}

function KnowCard() {
  const load = useServerFn(getMyImpressions);
  const [card, setCard] = useState<{ token: string; guessCount: number } | null | undefined>(undefined);
  useEffect(() => {
    void readLocalViewer()
      .then((v) => load({ data: { ...v, markSeen: false } }))
      .then((r) => setCard(r ? { token: r.token, guessCount: r.guessCount } : null))
      .catch(() => setCard(undefined));
  }, [load]);
  if (card === undefined) return null;
  if (!card) {
    return (
      <Link to="/know" className="card-soft mt-8 block px-5 py-4 text-lg hover:border-primary">
        See how your friends read you
      </Link>
    );
  }
  return (
    <Link to="/me/impressions" className="card-soft mt-8 block px-5 py-4 hover:border-primary">
      <span className="block break-all text-sm text-muted-foreground">nosure.app/guess/{card.token}</span>
      <span className="mt-1 block text-lg">
        {card.guessCount} {card.guessCount === 1 ? "person has" : "people have"} guessed
      </span>
    </Link>
  );
}

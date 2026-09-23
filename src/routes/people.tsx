import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, UserPlus, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { AppTabs } from "@/components/AppTabs";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Button } from "@/components/ui/button";
import { listPeople } from "@/lib/conversations.functions";
import { useViewer } from "@/lib/viewer";

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

type People = Awaited<ReturnType<typeof listPeople>>["people"];

function colorFor(name: string) {
  let total = 0;
  for (const letter of name) total = (total * 31 + (letter.codePointAt(0) ?? 0)) % 6;
  return `var(--code-ink-${total + 1})`;
}

function PeoplePage() {
  const [people, setPeople] = useState<People | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
          <Button asChild variant="ghost" size="icon" aria-label="Invite someone new">
            <Link to="/remote">
              <UserPlus aria-hidden="true" className="h-5 w-5" />
            </Link>
          </Button>
        </header>

        {people === null && <p className="mt-10 text-base text-muted-foreground">One second…</p>}

        {people?.length === 0 && (
          <div className="mt-24 text-center">
            <p className="text-lg text-muted-foreground">
              Start a round with someone. Your conversations will stay here.
            </p>
            <Button
              type="button"
              size="icon"
              aria-label="Start a round"
              onClick={() => setPickerOpen(true)}
              className="mt-8 h-16 w-16 rounded-full"
            >
              <Plus aria-hidden="true" className="h-7 w-7" />
            </Button>
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
                  <span className="mt-1 block truncate text-sm text-muted-foreground">
                    {person.status}
                  </span>
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

      {signedIn && people && people.length > 0 && (
        <Button
          type="button"
          size="icon"
          aria-label="Start a round"
          onClick={() => setPickerOpen(true)}
          className="fixed right-5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full shadow-lg sm:right-[max(1.25rem,calc((100vw-36rem)/2))]"
        >
          <Plus aria-hidden="true" className="h-6 w-6" />
        </Button>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 px-3 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-picker-title"
            className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-t-lg bg-card shadow-xl sm:rounded-lg"
          >
            <header className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 id="person-picker-title" className="text-3xl">
                Who do you want to ask?
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setPickerOpen(false)}
              >
                <X aria-hidden="true" />
              </Button>
            </header>
            <div className="max-h-[60vh] overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <Link
                to="/remote"
                className="flex min-h-16 items-center border-b border-border text-lg text-primary"
              >
                Someone new →
              </Link>
              {sorted.map((person) => {
                const displayName = person.nickname || person.name || "Someone";
                return (
                  <Link
                    key={person.personKey}
                    to="/remote"
                    search={{ person: person.personKey }}
                    className="flex min-h-16 items-center gap-3 border-b border-border text-lg last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-primary-foreground"
                      style={{ backgroundColor: colorFor(displayName) }}
                    >
                      {displayName.trim().charAt(0).toLocaleUpperCase() || "?"}
                    </span>
                    <span className="truncate">{displayName}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <AppTabs />
    </main>
  );
}

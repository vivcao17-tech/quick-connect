import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { trackVisit } from "@/lib/track";

import { listUnreadThreads } from "@/lib/conversations.functions";
import { getProfileBadge } from "@/lib/profile.functions";
import { listMyAnswerSets } from "@/lib/remote.functions";
import { useViewer } from "@/lib/viewer";




export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "NoSure — 3 questions, 30 seconds" },
      {
        name: "description",
        content:
          "Answer three questions, see where you land against someone else, then put the phone down and talk.",
      },
      { property: "og:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Answer three questions. Then talk about it.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Answer three questions. Then talk about it.",
      },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

type Unread = Awaited<ReturnType<typeof listUnreadThreads>>;

function Home() {
  const navigate = useNavigate();
  const viewer = useViewer();
  const [code, setCode] = useState("");
  const [unread, setUnread] = useState<Unread>({ items: [], total: 0 });
  const [listOpen, setListOpen] = useState(false);
  const [sets, setSets] = useState<Awaited<ReturnType<typeof listMyAnswerSets>>["sets"]>([]);

  const [badge, setBadge] = useState<{ name: string; newSince: number } | null>(null);

  const loadUnread = useServerFn(listUnreadThreads);
  const loadBadge = useServerFn(getProfileBadge);
  const loadSets = useServerFn(listMyAnswerSets);

  // Return visits: the gap since this browser last opened the app.
  useEffect(() => {
    if (!viewer.ready) return;
    trackVisit("home", viewer.profileId ? { profileId: viewer.profileId } : {});
  }, [viewer.ready, viewer.profileId]);

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void loadUnread({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then(setUnread)
      .catch(() => undefined);
  }, [viewer.ready, viewer.guestToken, viewer.profileId, loadUnread]);

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void loadSets({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then((result) => setSets(result.sets))
      .catch(() => setSets([]));
  }, [viewer.ready, viewer.guestToken, viewer.profileId, loadSets]);

  // Signed-in people get their own page, with a dot when someone has read them.
  useEffect(() => {
    if (!viewer.ready || !viewer.profileId) return;
    void loadBadge()
      .then((result) => setBadge({ name: result.displayName, newSince: result.newSince }))
      .catch(() => setBadge(null));
  }, [viewer.ready, viewer.profileId, loadBadge]);

  function onCode(value: string) {
    const next = value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
    setCode(next);
    if (next.length === 4) {
      void navigate({ to: "/join/$code", params: { code: next } });
    }
  }

  function openThread(item: Unread["items"][number]) {
    void navigate({
      to: "/with/$participantId/$sessionId",
      params: { participantId: item.personKey, sessionId: item.sessionId },
      search: { q: item.sessionQuestionId },
    });
  }

  const single = unread.items.length === 1 ? unread.items[0] : undefined;

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>

        <h1 className="mt-8 text-6xl leading-[0.95] sm:text-7xl">
          Pick a side.
          <br />
          <em className="italic text-primary">See their side of you.</em>
        </h1>

        {/* One tap from home into the thread that has something new in it. */}
        {unread.items.length > 0 && (
          <div className="mt-10">
            {single ? (
              <button
                onClick={() => openThread(single)}
                className="card-soft w-full border-primary px-6 py-5 text-left hover:opacity-90"
              >
                <p className="text-xs tracking-[0.18em] text-primary uppercase">New reply</p>
                <p className="mt-2 text-2xl">{single.name}</p>
                <p className="mt-1 text-base text-muted-foreground">{single.question}</p>
              </button>
            ) : (
              <button
                onClick={() => setListOpen((open) => !open)}
                className="card-soft w-full border-primary px-6 py-5 text-left hover:opacity-90"
              >
                <p className="text-xs tracking-[0.18em] text-primary uppercase">New replies</p>
                <p className="mt-2 text-2xl">
                  {unread.total} unread from {unread.items.length} conversations
                </p>
              </button>
            )}

            {listOpen && !single && (
              <div className="mt-3 flex flex-col gap-2">
                {unread.items.map((item) => (
                  <button
                    key={item.sessionQuestionId}
                    onClick={() => openThread(item)}
                    className="card-soft px-6 py-4 text-left hover:border-primary"
                  >
                    <p className="text-lg">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.question}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-12">
          <button
            className="btn-ink w-full py-6 text-xl hover:opacity-90"
            onClick={() => void navigate({ to: "/start" })}
          >
            Start
          </button>
          <p className="mt-3 text-sm text-muted-foreground">
            Three questions with someone you know. 30 seconds, no account.
          </p>
        </div>

        <Link
          to={badge && badge.newSince > 0 ? "/me" : "/start"}
          className="mt-10 block"
        >
          <div className="flex w-full items-center justify-between rounded-full border-2 border-primary px-6 py-4 text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            <span className="text-base font-medium">
              {badge && badge.newSince > 0
                ? `${badge.newSince} ${badge.newSince === 1 ? "person" : "people"} read you this week`
                : "See how people read you"}
            </span>
            {badge && badge.newSince > 0 && (
              <span
                aria-label="New reads"
                className="inline-block h-2.5 w-2.5 rounded-full bg-current"
              />
            )}
          </div>
        </Link>

        <div className="mt-12 flex flex-col gap-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link to="/people" className="underline underline-offset-4">
              People
            </Link>
            <Link to="/conversations" className="underline underline-offset-4">
              Ask someone else{sets.length > 0 ? ` (${sets.length})` : ""}
            </Link>
          </div>
          <label className="flex items-center gap-3">
            <span>Got a code?</span>
            <input
              id="room-code"
              value={code}
              onChange={(event) => onCode(event.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={4}
              placeholder="＿＿＿＿"
              aria-label="Four letter room code"
              className="w-32 rounded-full border border-border bg-card px-4 py-2 text-center text-base tracking-[0.4em] uppercase outline-none focus:border-primary"
            />
          </label>
        </div>
      </section>
    </main>
  );
}

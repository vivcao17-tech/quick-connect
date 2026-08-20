import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getPersonSessions } from "@/lib/conversations.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/with/$participantId/")({
  component: WithPersonPage,
  head: () => ({
    meta: [
      { title: "Everything you two answered — NoSure" },
      {
        name: "description",
        content: "Every set of questions you and this person have both answered, newest first.",
      },
      { property: "og:title", content: "Everything you two answered — NoSure" },
      {
        property: "og:description",
        content: "Every set of questions you two have both answered, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Everything you two answered — NoSure" },
      {
        name: "twitter:description",
        content: "Every set of questions you two have both answered, newest first.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof getPersonSessions>>;

export function ago(iso: string) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

function WithPersonPage() {
  const { participantId } = Route.useParams();
  const viewer = useViewer();
  const [data, setData] = useState<Data | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useServerFn(getPersonSessions);

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void load({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
        personKey: participantId,
      },
    })
      .then(setData)
      .catch(() => setData({ name: "", sessions: [] }));
  }, [load, participantId, viewer.ready, viewer.guestToken, viewer.profileId]);

  const sessions = data?.sessions ?? [];
  const name = data?.name || "them";
  const visible = showAll ? sessions : sessions.slice(0, 3);

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <Link
          to="/conversations"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          People
        </Link>
        <h1 className="mt-6 text-4xl leading-tight">You and {name}</h1>

        {data && sessions.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">Nothing between you yet.</p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          {visible.map((session) => (
            <Link
              key={session.sessionId}
              to="/with/$participantId/$sessionId"
              params={{ participantId, sessionId: session.sessionId }}
              className="card-soft block px-6 py-5"
            >
              <p className="text-lg">{session.topic || "Three questions"}</p>
              <p className="mt-3 text-xl">
                {session.different === 0 ? (
                  "Same answers"
                ) : (
                  <span className="text-primary">
                    {session.different} of {session.total} different
                  </span>
                )}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {session.messageCount === 0
                  ? "Nothing said yet"
                  : `${session.messageCount} ${session.messageCount === 1 ? "line" : "lines"}`}
                {" · "}
                {ago(session.lastActivity)}
                {session.unread > 0 && <span className="text-primary"> · new</span>}
              </p>
            </Link>
          ))}
        </div>

        {!showAll && sessions.length > 3 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-8 text-sm text-muted-foreground underline underline-offset-4"
          >
            See earlier
          </button>
        )}
      </section>
    </main>
  );
}

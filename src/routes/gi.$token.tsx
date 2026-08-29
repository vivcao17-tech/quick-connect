import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getAsyncInvite, joinAsyncGroup } from "@/lib/async-group.functions";
import { getGuestToken } from "@/lib/guest";

export const Route = createFileRoute("/gi/$token")({
  component: GroupInvitePage,
  head: () => ({
    meta: [
      { title: "Someone wants your answer — NoSure" },
      {
        name: "description",
        content:
          "Five questions from a friend. Answer whenever — it opens for everyone once the group is in.",
      },
      { property: "og:title", content: "Five questions from a friend" },
      {
        property: "og:description",
        content: "Answer whenever. It opens for everyone once the group is in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Five questions from a friend" },
      { name: "twitter:description", content: "Answer whenever. 30 seconds, no signup." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Invite = Awaited<ReturnType<typeof getAsyncInvite>>;

function GroupInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(getAsyncInvite);
  const join = useServerFn(joinAsyncGroup);

  const [invite, setInvite] = useState<Invite | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(window.localStorage.getItem("beside.name") ?? "");
    void load({ data: { token } })
      .then(setInvite)
      .catch(() => setFailed(true));
  }, [load, token]);

  async function enter() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      window.localStorage.setItem("beside.name", name.trim());
      const result = await join({
        data: { token, guestToken: getGuestToken(), displayName: name.trim() },
      });
      await navigate({ to: "/ga/$sessionId", params: { sessionId: result.sessionId } });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        {failed && <p className="text-lg text-muted-foreground">That link isn't good any more.</p>}
        {!failed && !invite && <p className="text-lg text-muted-foreground">One moment…</p>}
        {!failed && invite && (
          <>
            <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
              From {invite.fromName}
            </p>
            {invite.note && (
              <p className="mt-8 text-3xl leading-snug italic">"{invite.note}"</p>
            )}
            <h1 className="mt-8 text-4xl leading-tight">
              {invite.questionCount} questions. Answer whenever.
            </h1>
            <p className="mt-3 text-muted-foreground">
              Nobody sees anything — yours or theirs — until it opens for the whole group.
            </p>

            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void enter()}
              placeholder="Your name"
              className="mt-10 w-full rounded-full border border-border bg-card px-5 py-3 text-lg outline-none focus:border-primary"
            />
            <button
              onClick={enter}
              disabled={!name.trim() || busy}
              className="btn-ink mt-6 self-start disabled:opacity-30"
            >
              Start
            </button>
          </>
        )}
      </section>
    </main>
  );
}

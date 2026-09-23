import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getGuestToken } from "@/lib/guest";
import { track } from "@/lib/track";
import { joinRoom } from "@/lib/irl.functions";

export const Route = createFileRoute("/join/$code")({
  component: JoinPage,
  head: () => ({
    meta: [
      { title: "Join the room — NoSure" },
      {
        name: "description",
        content: "Type your name and you're in. Three questions, thirty seconds, no signup.",
      },
      { property: "og:title", content: "Join the room — NoSure" },
      { property: "og:description", content: "Three questions, thirty seconds, no signup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Join the room — NoSure" },
      { name: "twitter:description", content: "Three questions, thirty seconds, no signup." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const join = useServerFn(joinRoom);
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setGuestToken(getGuestToken()), []);

  async function go() {
    if (busy || !name.trim()) return;
    // Joining is always a guest action — no sign-in, even for Google users.
    const token = guestToken || getGuestToken();
    if (!guestToken) setGuestToken(token);
    setBusy(true);
    setError("");
    try {
      const result = await join({
        data: { guestToken: token, displayName: name.trim(), roomCode: code.toUpperCase() },
      });
      track(
        "name_entered",
        { where: "room_code_join", kind: result.kind, room_code: code.toUpperCase() },
        { sessionId: result.sessionId },
      );
      await navigate({
        to: result.kind === "group" ? "/g/$sessionId" : "/room/$sessionId",
        params: { sessionId: result.sessionId },
      });
    } catch {
      setError("That room isn't open. Check the code.");
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          Room {code.toUpperCase()}
        </p>
        <h1 className="mt-6 text-5xl leading-tight">What should they call you?</h1>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void go()}
          placeholder="Your name"
          className="mt-8 w-full rounded-full border border-border bg-card px-5 py-3 text-lg outline-none focus:border-primary"
        />
        <p className="mt-4 text-sm text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-4">
            terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
        <button
          onClick={go}
          disabled={!name.trim() || busy}
          className="btn-ink mt-6 self-start disabled:opacity-30"
        >
          I'm in
        </button>
        {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        <p className="mt-10 text-sm text-muted-foreground">No signup. Nothing to install.</p>
      </section>
    </main>
  );
}

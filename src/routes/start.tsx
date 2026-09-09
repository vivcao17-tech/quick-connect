import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getGuestToken } from "@/lib/guest";
import { createRoom } from "@/lib/irl.functions";

export const Route = createFileRoute("/start")({
  component: StartPage,
  head: () => ({
    meta: [
      { title: "Who are you asking? — NoSure" },
      {
        name: "description",
        content:
          "Someone right here, someone who isn't, or a whole table of people. Three questions either way.",
      },
      { property: "og:title", content: "Who are you asking? — NoSure" },
      {
        property: "og:description",
        content: "Someone right here, someone who isn't, or a whole table of people.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Who are you asking? — NoSure" },
      {
        name: "twitter:description",
        content: "Someone right here, someone who isn't, or a whole table of people.",
      },
    ],
  }),
});

function StartPage() {
  const navigate = useNavigate();
  const openRoom = useServerFn(createRoom);
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [hereOpen, setHereOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setGuestToken(getGuestToken());
    setName(window.localStorage.getItem("beside.name") ?? "");
  }, []);

  async function startHere() {
    if (busy || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      window.localStorage.setItem("beside.name", name.trim());
      const room = await openRoom({ data: { guestToken, displayName: name.trim() || "You" } });
      await navigate({ to: "/room/$sessionId", params: { sessionId: room.sessionId } });
    } catch {
      setError("Couldn't open a room. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <h1 className="text-4xl leading-tight">Who are you asking?</h1>

        <div className="mt-10 flex flex-col gap-3">
          <button
            onClick={() => setHereOpen(true)}
            className="card-soft px-6 py-6 text-left text-2xl hover:border-primary"
          >
            Someone right here
            <span className="mt-1 block text-base text-muted-foreground">
              A code and a QR they scan from your screen
            </span>
          </button>

          {hereOpen && (
            <div className="card-soft flex flex-wrap items-center gap-3 px-6 py-5">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              <button onClick={startHere} disabled={busy} className="btn-ink disabled:opacity-30">
                Open the room
              </button>
              <p className="w-full text-sm text-muted-foreground">
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
            </div>
          )}

          <button
            onClick={() => void navigate({ to: "/remote" })}
            className="card-soft px-6 py-6 text-left text-2xl hover:border-primary"
          >
            Someone who isn't here
            <span className="mt-1 block text-base text-muted-foreground">
              You answer three questions, then send them a link
            </span>
          </button>

          <button
            onClick={() => void navigate({ to: "/group" })}
            className="card-soft px-6 py-6 text-left text-2xl hover:border-primary"
          >
            A group
            <span className="mt-1 block text-base text-muted-foreground">
              Best with 3–6 people in one room
            </span>
          </button>
        </div>

        {error && <p className="mt-6 text-sm text-primary">{error}</p>}

        <Link
          to="/"
          className="mt-14 self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          Back
        </Link>
      </section>
    </main>
  );
}

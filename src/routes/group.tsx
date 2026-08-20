import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { createGroupRoom } from "@/lib/group.functions";
import { getGuestToken } from "@/lib/guest";

export const Route = createFileRoute("/group")({
  component: GroupSetup,
  head: () => ({
    meta: [
      { title: "Start a group room — NoSure" },
      {
        name: "description",
        content:
          "Open a room, everyone joins with a name, and each question shows where the room split. Best with 3–6 people.",
      },
      { property: "og:title", content: "Start a group room — NoSure" },
      {
        property: "og:description",
        content: "Everyone answers on their own phone. Then you talk about it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Start a group room — NoSure" },
      { name: "twitter:description", content: "Everyone answers on their own phone." },
    ],
  }),
});

function GroupSetup() {
  const navigate = useNavigate();
  const create = useServerFn(createGroupRoom);
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState(true);
  const [length, setLength] = useState<5 | 8>(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setGuestToken(getGuestToken()), []);

  async function open() {
    if (busy || !name.trim()) return;
    const token = guestToken || getGuestToken();
    if (!guestToken) setGuestToken(token);
    setBusy(true);
    setError("");
    try {
      const room = await create({
        data: { guestToken: token, displayName: name.trim(), playing, length },
      });
      await navigate({ to: "/g/$sessionId", params: { sessionId: room.sessionId } });
    } catch {
      setError("Couldn't open the room. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Group</p>
        <h1 className="mt-6 text-5xl leading-tight">Everyone in the room, one question at a time.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Best with 3–6 people.</p>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void open()}
          placeholder="Your name"
          className="mt-8 w-full rounded-full border border-border bg-card px-5 py-3 text-lg outline-none focus:border-primary"
        />

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setPlaying(true)}
            className={`card-soft px-6 py-5 text-left ${playing ? "border-primary" : "opacity-60"}`}
          >
            <span className="text-xl">I'm playing too</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              You answer along with everyone else.
            </span>
          </button>
          <button
            onClick={() => setPlaying(false)}
            className={`card-soft px-6 py-5 text-left ${!playing ? "border-primary" : "opacity-60"}`}
          >
            <span className="text-xl">I'm just running it</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              You read the questions and reveal. No answers from you.
            </span>
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {([5, 8] as const).map((value) => (
            <button
              key={value}
              onClick={() => setLength(value)}
              className={`card-soft px-6 py-5 text-left ${length === value ? "border-primary" : "opacity-60"}`}
            >
              <span className="text-xl">{value} questions</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {value === 5 ? "About ten minutes." : "About twenty minutes."}
              </span>
            </button>
          ))}
        </div>


        <button
          onClick={open}
          disabled={!name.trim() || busy}
          className="btn-ink mt-10 self-start disabled:opacity-30"
        >
          Open the room
        </button>
        {error && <p className="mt-6 text-sm text-primary">{error}</p>}
      </section>
    </main>
  );
}

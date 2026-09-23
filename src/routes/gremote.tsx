import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { TopicCloud } from "@/components/TopicCloud";
import type { CloudTopic } from "@/components/TopicCloud";
import { supabase } from "@/integrations/supabase/client";
import { createAsyncGroup } from "@/lib/async-group.functions";
import { getGuestToken } from "@/lib/guest";

export const Route = createFileRoute("/gremote")({
  component: RemoteGroupSetup,
  head: () => ({
    meta: [
      { title: "A group who isn't here — NoSure" },
      {
        name: "description",
        content:
          "Five questions, everyone answers on their own time, and it opens when the room is in. No app, no signup.",
      },
      { property: "og:title", content: "A group who isn't here — NoSure" },
      {
        property: "og:description",
        content: "Five questions. Everyone answers on their own time, then you see the room.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "A group who isn't here — NoSure" },
      { name: "twitter:description", content: "Five questions, answered on everyone's own time." },
    ],
  }),
});

type Topic = { id: string; slug: string; label: string };

function RemoteGroupSetup() {
  const navigate = useNavigate();
  const create = useServerFn(createAsyncGroup);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setGuestToken(getGuestToken());
    setName(window.localStorage.getItem("beside.name") ?? "");
    void supabase
      .from("topics")
      .select("id, slug, label")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setTopics((data as Topic[] | null) ?? []));
  }, []);

  async function start(topic: CloudTopic) {
    if (busy || !name.trim()) return;
    const token = guestToken || getGuestToken();
    setBusy(true);
    setError("");
    try {
      window.localStorage.setItem("beside.name", name.trim());
      const slug = topics.find((t) => t.id === topic.id)?.slug;
      const room = await create({
        data: {
          guestToken: token,
          displayName: name.trim(),
          ...(slug ? { topicSlug: slug } : {}),
        },
      });
      await navigate({ to: "/ga/$sessionId", params: { sessionId: room.sessionId } });
    } catch {
      setError("Couldn't open the room. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          Group · not here
        </p>
        <h1 className="mt-6 text-4xl leading-tight">You answer first, then they get a link.</h1>
        <p className="mt-3 text-muted-foreground">
          Five questions. Nobody sees anything until it opens.
        </p>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
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

        <p className="mt-10 text-lg text-muted-foreground">Pick a word to start from.</p>
        <div className={name.trim() ? "" : "pointer-events-none opacity-40"}>
          <TopicCloud
            topics={topics.map((t) => ({ id: t.id, label: t.label }))}
            selectedIds={[]}
            onToggle={(topic) => void start(topic)}
            disabled={busy || !name.trim()}
          />
        </div>
        {error && <p className="mt-4 text-sm text-primary">{error}</p>}
      </section>
    </main>
  );
}

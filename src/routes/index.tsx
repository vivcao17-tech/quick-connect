import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";
import { createRoom } from "@/lib/irl.functions";
import { startSession, submitAnswer, logEvent } from "@/lib/play.functions";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Beside — 3 questions, 30 seconds" },
      {
        name: "description",
        content:
          "Pick a word. Answer three questions. See where you land against everyone else, then put the phone down and talk.",
      },
      { property: "og:title", content: "Beside — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Pick a word. Answer three questions. Then talk about it.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Beside — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Pick a word. Answer three questions. Then talk about it.",
      },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

type Topic = { id: string; slug: string; label: string };
type PlayQuestion = {
  sessionQuestionId: string;
  questionId: string;
  text: string;
  options: { key: "a" | "b" | "c"; label: string }[];
};
type Tally = { optionKey: "a" | "b" | "c"; votes: number }[];

const SCATTER = [
  { top: 6, left: 8, size: 2.9, rotate: -7 },
  { top: 20, left: 58, size: 3.7, rotate: 4 },
  { top: 34, left: 14, size: 3.2, rotate: 9 },
  { top: 47, left: 63, size: 2.6, rotate: -5 },
  { top: 58, left: 22, size: 4.1, rotate: -2 },
  { top: 71, left: 55, size: 3.0, rotate: 7 },
  { top: 82, left: 12, size: 2.7, rotate: -9 },
  { top: 90, left: 60, size: 3.4, rotate: 3 },
];

function Home() {
  const [hostName, setHostName] = useState("");
  const [stage, setStage] = useState<"landing" | "topics" | "play" | "done">("landing");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [guestToken, setGuestToken] = useState("");
  const [topicLabel, setTopicLabel] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<"a" | "b" | "c" | null>(null);
  const [tally, setTally] = useState<Tally | null>(null);
  const [topicsShownAt, setTopicsShownAt] = useState(0);

  const start = useServerFn(startSession);
  const answer = useServerFn(submitAnswer);
  const track = useServerFn(logEvent);
  const openRoom = useServerFn(createRoom);
  const navigate = useNavigate();

  async function startRoom() {
    if (busy || !guestToken) return;
    setBusy(true);
    try {
      const room = await openRoom({ data: { guestToken, displayName: hostName.trim() || "You" } });
      await navigate({ to: "/room/$sessionId", params: { sessionId: room.sessionId } });
    } catch {
      setError("Couldn't open a room. Try again.");
      setBusy(false);
    }
  }

  useEffect(() => {
    setGuestToken(getGuestToken());
    supabase
      .from("topics")
      .select("id, slug, label")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setTopics((data as Topic[]) ?? []));
  }, []);

  const current = questions[index];
  const total = questions.length;

  async function pickTopic(topic: Topic) {
    if (busy || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      await track({
        data: {
          guestToken,
          name: "topics_selected",
          props: { count: 1, duration_ms: Date.now() - topicsShownAt },
        },
      });
      const result = await start({ data: { guestToken, topicSlug: topic.slug } });
      setSessionId(result.sessionId);
      setTopicLabel(result.topicLabel);
      setQuestions(result.questions);
      setIndex(0);
      setPicked(null);
      setTally(null);
      setStage("play");
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(optionKey: "a" | "b" | "c") {
    if (busy || !current) return;
    setBusy(true);
    setError("");
    setPicked(optionKey);
    try {
      const result = await answer({
        data: {
          guestToken,
          sessionQuestionId: current.sessionQuestionId,
          optionKey,
          ...(reason.trim() ? { reasonText: reason.trim() } : {}),
        },
      });
      setTally(result.revealed ? result.tally : null);
    } catch {
      setPicked(null);
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setReason("");
    setPicked(null);
    setTally(null);
    if (index + 1 < total) {
      setIndex(index + 1);
      return;
    }
    setStage("done");
    await track({
      data: {
        guestToken,
        sessionId,
        name: "session_ended",
        props: { question_count: total },
      },
    });
  }

  async function skip() {
    if (!current) return;
    await track({
      data: {
        guestToken,
        sessionId,
        name: "question_skipped",
        props: { question_id: current.questionId },
      },
    });
    await next();
  }

  const totals = useMemo(() => {
    if (!tally) return null;
    const sum = tally.reduce((acc, row) => acc + row.votes, 0) || 1;
    const rows = (current?.options ?? []).map((option) => {
      const votes = tally.find((row) => row.optionKey === option.key)?.votes ?? 0;
      return { ...option, votes, share: Math.round((votes / sum) * 100) };
    });
    const top = [...rows].sort((a, b) => b.votes - a.votes)[0];
    return { rows, top };
  }, [tally, current]);

  return (
    <main className="paper min-h-screen bg-background">
      {stage === "landing" && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
          <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Beside</p>
          <h1 className="mt-8 text-6xl leading-[0.95] sm:text-7xl">
            Three questions.
            <br />
            <em className="italic text-primary">Then you talk.</em>
          </h1>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-muted-foreground">
            Answer three questions first — then send them to someone and find out how differently
            they'd answer.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <button
              className="btn-ink hover:opacity-90"
              onClick={() => void navigate({ to: "/remote" })}
            >
              Your turn
            </button>
            <span className="text-sm text-muted-foreground">30 seconds, no account</span>
          </div>

          <div className="mt-10 border-t border-border pt-8">
            <p className="text-lg">Someone's sitting across from you?</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
                placeholder="Your name"
                className="rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              <button onClick={startRoom} disabled={busy} className="btn-ink disabled:opacity-30">
                Start a session
              </button>
            </div>
          </div>
          <Link
            to="/remote"
            className="mt-6 self-start text-sm text-muted-foreground underline underline-offset-4"
          >
            Or send it to someone who isn't here
          </Link>
        </section>
      )}

      {stage === "topics" && (
        <section className="mx-auto min-h-screen max-w-2xl px-6 py-16">
          <h2 className="text-3xl">What's on your mind?</h2>
          <p className="mt-2 text-muted-foreground">Tap a word.</p>
          <div className="relative mt-10 h-[520px]">
            {topics.map((topic, i) => {
              const spot = SCATTER[i % SCATTER.length]!;
              return (
                <button
                  key={topic.id}
                  disabled={busy}
                  onClick={() => pickTopic(topic)}
                  className="topic-word absolute hover:scale-105 hover:text-primary disabled:opacity-40"
                  style={{
                    top: `${spot.top}%`,
                    left: `${spot.left}%`,
                    fontSize: `${spot.size}rem`,
                    transform: `rotate(${spot.rotate}deg)`,
                  }}
                >
                  {topic.label}
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "play" && current && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">{topicLabel}</p>

          <h2 className="mt-6 text-4xl leading-tight">{current.text}</h2>

          {!tally && (
            <>
              <div className="mt-10 flex flex-col gap-3">
                {current.options.map((option) => (
                  <button
                    key={option.key}
                    disabled={busy}
                    onClick={() => choose(option.key)}
                    className="card-soft px-6 py-5 text-left text-lg hover:border-primary disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why? (optional)"
                className="mt-6 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              <button
                onClick={skip}
                className="mt-6 self-start text-sm text-muted-foreground underline underline-offset-4"
              >
                Skip this one
              </button>
            </>
          )}

          {tally && totals && (
            <div className="mt-10">
              <p className="text-lg">
                {picked === totals.top?.key
                  ? "You're with most people."
                  : "You're in the minority here."}
              </p>
              <div className="mt-6 flex flex-col gap-4">
                {totals.rows.map((row) => (
                  <div key={row.key}>
                    <div className="flex items-baseline justify-between text-base">
                      <span className={row.key === picked ? "text-primary" : ""}>{row.label}</span>
                      <span className="text-muted-foreground">{row.share}%</span>
                    </div>
                    <div className="mt-2 h-px w-full bg-border">
                      <div
                        className="h-px bg-primary"
                        style={{ width: `${Math.max(row.share, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={next} className="btn-quiet mt-12 hover:bg-secondary">
                {index + 1 < total ? "Next" : "That's the three"}
              </button>
            </div>
          )}

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "done" && (
        <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
          <h2 className="text-4xl">Now talk about it.</h2>
          <button
            onClick={() => {
              setTopicsShownAt(Date.now());
              setStage("topics");
            }}
            className="mt-10 self-center text-sm text-muted-foreground underline underline-offset-4"
          >
            Another word
          </button>
        </section>
      )}
    </main>
  );
}

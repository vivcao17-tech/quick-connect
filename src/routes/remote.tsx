import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";
import {
  answerAsSender,
  createInvites,
  createRemoteSession,
  listTopicQuestions,
} from "@/lib/remote.functions";
import type { OptionKey, PlayQuestion } from "@/lib/remote-shared";

export const Route = createFileRoute("/remote")({
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "Send three questions — Beside" },
      {
        name: "description",
        content:
          "Answer three questions, then send them to the people you'd actually want to hear from. 30 seconds, no signup.",
      },
      { property: "og:title", content: "Beside — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Beside — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
    ],
  }),
});

type Topic = { id: string; slug: string; label: string };
type Candidate = { id: string; text: string; options: { key: OptionKey; label: string }[] };
type Recipient = { label: string; note: string };

const SCATTER = [
  { top: 4, left: 6, size: 2.9, rotate: -7 },
  { top: 18, left: 55, size: 3.7, rotate: 4 },
  { top: 32, left: 12, size: 3.2, rotate: 9 },
  { top: 45, left: 60, size: 2.6, rotate: -5 },
  { top: 56, left: 20, size: 4.1, rotate: -2 },
  { top: 69, left: 52, size: 3.0, rotate: 7 },
  { top: 80, left: 10, size: 2.7, rotate: -9 },
  { top: 88, left: 58, size: 3.4, rotate: 3 },
];

function RemotePage() {
  const [stage, setStage] = useState<"topics" | "pick" | "play" | "send" | "sent">("topics");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [topicLabel, setTopicLabel] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<OptionKey | null>(null);
  const [tally, setTally] = useState<{ optionKey: OptionKey; votes: number }[] | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([{ label: "", note: "" }]);
  const [links, setLinks] = useState<{ token: string; label: string; note: string }[]>([]);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadQuestions = useServerFn(listTopicQuestions);
  const createSession = useServerFn(createRemoteSession);
  const answer = useServerFn(answerAsSender);
  const send = useServerFn(createInvites);

  useEffect(() => {
    setGuestToken(getGuestToken());
    setName(window.localStorage.getItem("beside.name") ?? "");
    supabase
      .from("topics")
      .select("id, slug, label")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setTopics((data as Topic[]) ?? []));
  }, []);

  const current = questions[index];

  async function pickTopic(topic: Topic) {
    setBusy(true);
    setError("");
    try {
      const result = await loadQuestions({ data: { topicSlug: topic.slug } });
      setTopicLabel(result.topic.label);
      setTopicSlug(result.topic.slug);
      setCandidates(result.questions);
      setChosen(result.questions.slice(0, 3).map((q) => q.id));
      setStage("pick");
    } catch {
      setError("That didn't load. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setChosen((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length >= 5
          ? prev
          : [...prev, id],
    );
  }

  async function begin() {
    if (chosen.length < 3 || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      const displayName = name.trim() || "A friend";
      window.localStorage.setItem("beside.name", displayName);
      const result = await createSession({
        data: {
          guestToken,
          displayName,
          topicSlug,
          questionIds: candidates.filter((q) => chosen.includes(q.id)).map((q) => q.id),
        },
      });
      setSessionId(result.sessionId);
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

  async function choose(optionKey: OptionKey, chipId?: string, chipText?: string) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    setPicked(optionKey);
    try {
      const text = chipText ?? reason.trim();
      const result = await answer({
        data: {
          guestToken,
          sessionQuestionId: current.sessionQuestionId,
          optionKey,
          ...(text ? { reasonText: text } : {}),
          ...(chipId ? { reasonChipId: chipId } : {}),
        },
      });
      setTally(result.tally);
    } catch {
      setPicked(null);
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setReason("");
    setPicked(null);
    setTally(null);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    setStage("send");
  }

  async function sendIt() {
    const clean = recipients.filter((r) => r.label.trim());
    if (clean.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await send({
        data: {
          guestToken,
          sessionId,
          recipients: clean.map((r) => ({ label: r.label.trim(), note: r.note.trim() })),
        },
      });
      setLinks(result.invites);
      const stored = JSON.parse(window.localStorage.getItem("beside.sent") ?? "[]");
      window.localStorage.setItem(
        "beside.sent",
        JSON.stringify([{ sessionId, at: Date.now() }, ...stored].slice(0, 20)),
      );
      setStage("sent");
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string, label: string, note: string) {
    const origin = window.location.origin;
    const message = `${note ? `${note}\n\n` : ""}3 questions · 30 seconds · no signup\n${origin}/i/${token}`;
    await navigator.clipboard.writeText(message);
    setCopied(token);
    window.setTimeout(() => setCopied(""), 2500);
    void label;
  }

  const totals = useMemo(() => {
    if (!tally || !current) return null;
    const sum = tally.reduce((acc, row) => acc + row.votes, 0) || 1;
    const rows = current.options.map((option) => {
      const votes = tally.find((row) => row.optionKey === option.key)?.votes ?? 0;
      return { ...option, votes, share: Math.round((votes / sum) * 100) };
    });
    const top = [...rows].sort((a, b) => b.votes - a.votes)[0];
    return { rows, top };
  }, [tally, current]);

  return (
    <main className="paper min-h-screen bg-background">
      {stage === "topics" && (
        <section className="mx-auto min-h-screen max-w-2xl px-6 py-16">
          <h1 className="text-3xl">What's on your mind?</h1>
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

      {stage === "pick" && (
        <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
          <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">{topicLabel}</p>
          <h1 className="mt-6 text-4xl leading-tight">Which ones do you want to ask?</h1>
          <p className="mt-2 text-muted-foreground">Keep three. Take five if you're feeling it.</p>

          <div className="mt-8 flex flex-col gap-3">
            {candidates.map((q) => {
              const on = chosen.includes(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => toggle(q.id)}
                  className={`card-soft px-6 py-5 text-left text-lg ${on ? "border-primary" : "opacity-60"}`}
                >
                  {q.text}
                </button>
              );
            })}
          </div>

          <label className="mt-8 block text-sm text-muted-foreground">
            What should they see your name as?
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Amy"
              className="mt-2 w-full rounded-full border border-border bg-card px-5 py-3 text-base text-foreground outline-none focus:border-primary"
            />
          </label>

          <button
            onClick={begin}
            disabled={busy || chosen.length < 3}
            className="btn-ink mt-8 hover:opacity-90 disabled:opacity-40"
          >
            Answer them first
          </button>
          {error && <p className="mt-4 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "play" && current && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">{topicLabel}</p>
          <h1 className="mt-6 text-4xl leading-tight">{current.text}</h1>

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
                placeholder="Why? (one line, optional)"
                className="mt-6 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              {current.chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.chips.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setReason(chip.text)}
                      className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
                    >
                      {chip.text}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tally && totals && (
            <div className="mt-10">
              <p className="text-lg">
                {picked === totals.top?.key
                  ? "Here are your results — you're with most people."
                  : "Here are your results — you're in the minority."}
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
                {index + 1 < questions.length ? "Next" : "Send these to someone"}
              </button>
            </div>
          )}

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}

    </main>
  );
}


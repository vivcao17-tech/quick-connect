import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { impressionStem, withName } from "@/components/QuestionText";
import { TopicCloud } from "@/components/TopicCloud";
import type { CloudTopic } from "@/components/TopicCloud";
import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";
import {
  answerAsSender,
  createRemoteSession,
  listTopicQuestions,
} from "@/lib/remote.functions";
import type { OptionKey, PlayQuestion } from "@/lib/remote-shared";
import { useViewer } from "@/lib/viewer";


export const Route = createFileRoute("/remote")({
  validateSearch: (search: Record<string, unknown>): { impression?: string } =>
    typeof search["impression"] === "string" ? { impression: search["impression"] } : {},
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "Send three questions — NoSure" },
      {
        name: "description",
        content:
          "Answer three questions, then send them to the people you'd actually want to hear from. 30 seconds, no signup.",
      },
      { property: "og:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
    ],
  }),
});

type Topic = { id: string; slug: string; label: string };
type Candidate = { id: string; text: string; options: { key: OptionKey; label: string }[] };



function RemotePage() {
  const { impression: impressionQuestionId } = Route.useSearch();
  const viewer = useViewer();
  const [stage, setStage] = useState<"topics" | "pick" | "play">("topics");
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const loadQuestions = useServerFn(listTopicQuestions);
  const createSession = useServerFn(createRemoteSession);
  const answer = useServerFn(answerAsSender);


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
      const result = await loadQuestions({ data: { topicSlug: topic.slug, ...(guestToken ? { guestToken } : {}) } });
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
    void navigate({ to: "/send/$sessionId", params: { sessionId } });
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
          <p className="mt-2 max-w-md text-muted-foreground">
            Answer three questions first — then send them to someone and find out how differently
            they'd answer.
          </p>
          <p className="mt-4 text-muted-foreground">Tap a word.</p>

          <div className="mt-10">
            <TopicCloud
              topics={topics}
              selectedIds={[]}
              disabled={busy}
              onToggle={(topic: CloudTopic) => void pickTopic(topics.find((t) => t.id === topic.id)!)}
            />
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
          <h1 className="mt-6 text-4xl leading-tight">
            {current.kind === "impression"
              ? withName(impressionStem(current, "self"), "you")
              : current.text}
          </h1>

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


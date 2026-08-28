import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  getAdminMetrics,
  getAdminQuestionAverages,
  getAdminSessions,
} from "@/lib/admin.functions";



export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Dashboard — NoSure" },
      { name: "description", content: "Private usage dashboard for NoSure." },
      { property: "og:title", content: "Dashboard — NoSure" },
      { property: "og:description", content: "Private usage dashboard for NoSure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card-soft px-6 py-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl">{value}</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function pct(part: number, whole: number) {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function secs(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
}


function AdminPage() {
  const [windowDays, setWindowDays] = useState(30);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const load = useServerFn(getAdminMetrics);
  const loadSessions = useServerFn(getAdminSessions);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setSignedIn(true);
      if (event === "SIGNED_OUT") setSignedIn(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const query = useQuery({
    queryKey: ["admin-metrics", windowDays],
    queryFn: () => load({ data: { windowDays } }),
    retry: false,
  });
  const sessions = useQuery({
    queryKey: ["admin-sessions", windowDays],
    queryFn: () => loadSessions({ data: { windowDays } }),
    retry: false,
  });
  const loadQuestions = useServerFn(getAdminQuestionAverages);
  const questionAverages = useQuery({
    queryKey: ["admin-question-averages"],
    queryFn: () => loadQuestions(),
    retry: false,
  });

  const [questionSort, setQuestionSort] = useState<"split" | "window" | "asked">("asked");
  const questionRows = [...(questionAverages.data ?? [])].sort((a, b) => {
    if (questionSort === "split") return (a.imbalance ?? 2) - (b.imbalance ?? 2);
    if (questionSort === "window")
      return (b.avgAnswerWindowSeconds ?? -1) - (a.avgAnswerWindowSeconds ?? -1);
    return b.timesAsked - a.timesAsked;
  });

  const m = query.data;




  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl">Dashboard</h1>
        <div className="mt-6 flex gap-2">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              onClick={() => setWindowDays(value)}
              className={`rounded-full border px-4 py-2 text-sm ${
                windowDays === value ? "border-primary text-primary" : "border-border"
              }`}
            >
              {value} days
            </button>
          ))}
        </div>

        {query.isLoading && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {query.isError && (
          <p className="mt-10 text-muted-foreground">
            This page is for the account listed in ADMIN_EMAILS. Sign in with that address.
          </p>
        )}

        {m && (
          <>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <Stat label="Rooms started" value={String(m.rooms.reduce((a, r) => a + r.started, 0))} />
              <Stat
                label="Rooms finished"
                value={String(m.rooms.reduce((a, r) => a + r.finished, 0))}
              />
              <Stat label="Answers" value={String(m.play.answers)} />
            </div>

            <h2 className="mt-12 text-2xl">By mode</h2>
            <div className="mt-4 flex flex-col gap-2">
              {m.rooms.map((row) => (
                <div key={row.kind} className="flex justify-between border-b border-border py-2">
                  <span>{row.kind}</span>
                  <span className="text-muted-foreground">
                    {row.started} started · {row.finished} finished ({pct(row.finished, row.started)})
                  </span>
                </div>
              ))}
              {m.rooms.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
            </div>

            <h2 className="mt-12 text-2xl">Invites</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Sent" value={String(m.invites.sent)} />
              <Stat
                label="Opened"
                value={String(m.invites.opened)}
                note={pct(m.invites.opened, m.invites.sent)}
              />
              <Stat
                label="Answered through"
                value={String(m.invites.completed)}
                note={pct(m.invites.completed, m.invites.opened)}
              />
            </div>

            <h2 className="mt-12 text-2xl">After the reveal</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Questions revealed" value={String(m.play.revealedQuestions)} />
              <Stat
                label="Questions with talk"
                value={String(m.play.questionsWithTalk)}
                note={pct(m.play.questionsWithTalk, m.play.revealedQuestions)}
              />
              <Stat label="Messages" value={String(m.play.messages)} />
            </div>

            <h2 className="mt-12 text-2xl">People</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stat label="People seen" value={String(m.people.total)} />
              <Stat
                label="Came back for another room"
                value={String(m.people.returning)}
                note={pct(m.people.returning, m.people.total)}
              />
            </div>

            <h2 className="mt-12 text-2xl">Day by day</h2>
            <div className="mt-4 flex flex-col gap-1">
              {m.daily.map((row) => (
                <div key={row.day} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{row.day}</span>
                  <span>
                    {row.sessions} rooms · {row.answers} answers
                  </span>
                </div>
              ))}
            </div>

            <h2 className="mt-12 text-2xl">Questions, all time</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {(
                [
                  ["asked", "Most asked"],
                  ["split", "Closest split"],
                  ["window", "Longest answer window"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setQuestionSort(key)}
                  className={`rounded-full border px-3 py-1 ${
                    questionSort === key ? "border-primary text-primary" : "border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col">
              {questionRows.map((row) => {
                const total = row.options.reduce((a, o) => a + o.votes, 0);
                return (
                  <div key={row.questionId} className="border-b border-border py-3">
                    <p>{row.text}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.options
                        .map(
                          (o) =>
                            `${o.label} ${o.votes}${total ? ` (${Math.round((o.votes / total) * 100)}%)` : ""}`,
                        )
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.split ?? "—"} · avg window {secs(row.avgAnswerWindowSeconds)} · asked in{" "}
                      {row.timesAsked} {row.timesAsked === 1 ? "room" : "rooms"} · {row.totalAnswers}{" "}
                      answers
                    </p>
                  </div>
                );
              })}
              {questionAverages.isSuccess && questionRows.length === 0 && (
                <p className="text-muted-foreground">No answers yet.</p>
              )}
            </div>

            <h2 className="mt-12 text-2xl">Rooms</h2>

            <div className="mt-4 flex flex-col">
              {(sessions.data ?? []).map((row) => (
                <Link
                  key={row.id}
                  to="/admin/s/$sessionId"
                  params={{ sessionId: row.id }}
                  className="flex items-baseline justify-between gap-4 border-b border-border py-3 hover:text-primary"
                >
                  <span>
                    {new Date(row.createdAt).toLocaleString()}{" "}
                    <span className="text-muted-foreground">· {row.kind}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {row.people} {row.people === 1 ? "person" : "people"} · {row.revealed}/
                    {row.total} revealed · {row.endedAt ? "finished" : "open"}
                  </span>
                </Link>
              ))}
              {sessions.isSuccess && (sessions.data ?? []).length === 0 && (
                <p className="text-muted-foreground">No rooms in this window.</p>
              )}
            </div>
          </>
        )}

      </section>
    </main>
  );
}

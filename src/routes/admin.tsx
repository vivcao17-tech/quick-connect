import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { exportCsv } from "@/lib/admin-csv";
import { getAdminImpressions } from "@/lib/admin.functions";
import { getGuestToken } from "@/lib/guest";
import {
  addTestIdentityFn,
  getCohorts,
  getFunnel,
  getInviteReport,
  getNotificationReport,
  getOverview,
  getPeople,
  getPersonTimeline,
  getQuestionPerformance,
  getSessionRows,
  getTestIdentities,
  markSessionTest,
  removeTestIdentityFn,
} from "@/lib/analytics.functions";
import type { OverviewNumbers, QuestionRow } from "@/lib/analytics.server";
import type { TestIdentity } from "@/lib/testing.server";

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

/* ---------- formatting ---------- */

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value * 1000) / 10}%`;

const num = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : String(Math.round(value * 10 ** digits) / 10 ** digits);

function secs(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const v = Math.round(value);
  if (v < 60) return `${v}s`;
  if (v < 3600) return `${Math.floor(v / 60)}m ${v % 60}s`;
  if (v < 86400) return `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`;
  return `${Math.floor(v / 86400)}d ${Math.floor((v % 86400) / 3600)}h`;
}

function delta(current: number | null, previous: number | null, format: (v: number | null) => string) {
  if (current === null || previous === null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const sign = change >= 0 ? "+" : "";
  return `${sign}${Math.round(change * 100)}% vs. previous (${format(previous)})`;
}

function isoDay(offsetDays: number) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

/* ---------- small building blocks ---------- */

function Stat({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="card-soft px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-primary text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-muted-foreground underline hover:text-primary">
      Export CSV
    </button>
  );
}

const TABS = [
  ["overview", "Overview"],
  ["funnel", "Funnel"],
  ["cohorts", "Cohorts"],
  ["people", "People"],
  ["questions", "Questions"],
  ["impressions", "Impressions"],
  ["sessions", "Sessions"],
  ["invites", "Invites"],
  ["notifications", "Notifications"],
  ["testing", "Testing"],
] as const;

type Tab = (typeof TABS)[number][0];

/* ---------- page ---------- */

function AdminPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [fromDay, setFromDay] = useState(isoDay(30));
  const [toDay, setToDay] = useState(isoDay(-1));
  const [includeTest, setIncludeTest] = useState(false);

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

  const range = useMemo(
    () => ({ from: `${fromDay}T00:00:00Z`, to: `${toDay}T00:00:00Z`, includeTest }),
    [fromDay, toDay, includeTest],
  );
  const enabled = signedIn === true;

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-5xl px-6 py-14">
        <h1 className="text-4xl">Dashboard</h1>

        {signedIn === false && (
          <div className="card-soft mt-8 px-6 py-5">
            <p>You're not signed in.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with the address listed in ADMIN_EMAILS, then you'll land back here.
            </p>
            <Link
              to="/auth"
              search={{ redirect: "/admin" }}
              className="btn-ink mt-4 inline-block hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        )}

        {enabled && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={fromDay}
                  onChange={(e) => setFromDay(e.target.value)}
                  className="rounded-md border border-border bg-transparent px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={toDay}
                  onChange={(e) => setToDay(e.target.value)}
                  className="rounded-md border border-border bg-transparent px-2 py-1"
                />
              </label>
              {[7, 30, 90].map((days) => (
                <Pill
                  key={days}
                  active={fromDay === isoDay(days) && toDay === isoDay(-1)}
                  onClick={() => {
                    setFromDay(isoDay(days));
                    setToDay(isoDay(-1));
                  }}
                >
                  {days}d
                </Pill>
              ))}
              <label className="ml-auto flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeTest}
                  onChange={(e) => setIncludeTest(e.target.checked)}
                />
                Include test rooms
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {TABS.map(([key, label]) => (
                <Pill key={key} active={tab === key} onClick={() => setTab(key)}>
                  {label}
                </Pill>
              ))}
            </div>

            <div className="mt-8">
              {tab === "overview" && <OverviewTab range={range} />}
              {tab === "funnel" && <FunnelTab range={range} />}
              {tab === "cohorts" && <CohortsTab includeTest={includeTest} />}
              {tab === "people" && <PeopleTab includeTest={includeTest} />}
              {tab === "questions" && <QuestionsTab includeTest={includeTest} />}
              {tab === "impressions" && <ImpressionsTab includeTest={includeTest} />}
              {tab === "sessions" && <SessionsTab range={range} />}
              {tab === "invites" && <InvitesTab range={range} />}
              {tab === "notifications" && <NotificationsTab range={range} />}
              {tab === "testing" && <TestingTab />}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

type Range = { from: string; to: string; includeTest: boolean };

/* ---------- 1. overview ---------- */

function OverviewTab({ range }: { range: Range }) {
  const load = useServerFn(getOverview);
  const query = useQuery({
    queryKey: ["admin-overview", range],
    queryFn: () => load({ data: range }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (query.isError)
    return (
      <p className="text-muted-foreground">
        You're signed in, but this address isn't listed in ADMIN_EMAILS.
      </p>
    );

  const c = query.data?.current as OverviewNumbers | undefined;
  const p = query.data?.previous as OverviewNumbers | undefined;
  if (!c || !p) return null;

  const six: { label: string; value: string; note: string | null }[] = [
    {
      label: "Invite completion",
      value: pct(c.inviteCompletionRate),
      note:
        delta(c.inviteCompletionRate, p.inviteCompletionRate, pct) ??
        `${c.invitesCompleted}/${c.invitesOpened} opened`,
    },
    {
      label: "Reveal → reply",
      value: pct(c.revealToReplyRate),
      note: delta(c.revealToReplyRate, p.revealToReplyRate, pct) ?? `${c.reveals} reveals`,
    },
    {
      label: "Repeat pairs",
      value: pct(c.repeatPairRate),
      note: delta(c.repeatPairRate, p.repeatPairRate, pct) ?? `${c.pairs} pairs`,
    },
    {
      label: "Bridge rate",
      value: pct(c.bridgeRate),
      note: delta(c.bridgeRate, p.bridgeRate, pct) ?? "group → 1:1",
    },
    {
      label: "Save capture",
      value: c.savePromptShown === 0 ? "—" : pct(c.savePromptCaptureRate),
      note:
        c.savePromptShown === 0
          ? "save step not seen yet"
          : `${c.endShown} reached ending · ${c.savePromptShown} saw the save step`,
    },
    {
      label: "Reveal → first message",
      value: secs(c.medianRevealToFirstMessage),
      note: delta(c.medianRevealToFirstMessage, p.medianRevealToFirstMessage, secs) ?? "median",
    },
  ];

  const extras: { label: string; value: string; note: string }[] = [
    {
      label: "k-factor",
      value: num(c.kFactor),
      note: "invites sent per finisher × completion rate — above 1 is organic growth",
    },
    {
      label: "Invites per finisher",
      value: num(c.invitesPerFinisher),
      note: "how many people each finisher actually asks",
    },
    {
      label: "Time to second session",
      value: secs(c.medianTimeToSecondSession),
      note: "median gap; the single best early retention predictor",
    },
    {
      label: "Session depth",
      value: num(c.medianSessionDepth, 0),
      note: "median answers per room",
    },
    {
      label: "Messages per revealed question",
      value: num(c.medianMessagesPerRevealedQuestion, 0),
      note: "median; conversation density after the reveal",
    },
    { label: "People seen", value: num(c.people, 0), note: `${c.sessions} rooms in range` },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {six.map((item) => (
          <Stat key={item.label} {...item} />
        ))}
      </div>

      <div className="mt-10 flex items-baseline justify-between">
        <h2 className="text-2xl">Also worth watching</h2>
        <ExportButton
          onClick={() =>
            exportCsv(
              "nosure-overview",
              ["metric", "value"],
              [...six, ...extras].map((row) => [row.label, row.value]),
            )
          }
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {extras.map((item) => (
          <Stat key={item.label} {...item} />
        ))}
      </div>
    </>
  );
}

/* ---------- 2. funnel ---------- */

function FunnelTab({ range }: { range: Range }) {
  const [segment, setSegment] = useState<"none" | "note" | "mode" | "week">("note");
  const load = useServerFn(getFunnel);
  const query = useQuery({
    queryKey: ["admin-funnel", range, segment],
    queryFn: () => load({ data: { ...range, segment } }),
    retry: false,
  });

  const segments = query.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["none", "All"],
            ["note", "Note vs. no note"],
            ["mode", "By mode"],
            ["week", "By cohort week"],
          ] as const
        ).map(([key, label]) => (
          <Pill key={key} active={segment === key} onClick={() => setSegment(key)}>
            {label}
          </Pill>
        ))}
        <span className="ml-auto">
          <ExportButton
            onClick={() =>
              exportCsv(
                "nosure-funnel",
                ["segment", "step", "count", "conversion_from_previous"],
                segments.flatMap((s) =>
                  s.steps.map((step, index) => {
                    const previous = index === 0 ? step.count : s.steps[index - 1]!.count;
                    return [s.segment, step.label, step.count, previous ? step.count / previous : ""];
                  }),
                ),
              )
            }
          />
        </span>
      </div>

      {query.isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {segments.map((s) => (
          <div key={s.segment}>
            <h3 className="text-xl">{s.segment}</h3>
            <p className="text-sm text-muted-foreground">{s.sent} invites sent</p>
            <div className="mt-3 flex flex-col">
              {s.steps.map((step, index) => {
                const first = s.steps[0]?.count ?? 0;
                const previous = index === 0 ? step.count : s.steps[index - 1]!.count;
                const width = first ? Math.max(2, (step.count / first) * 100) : 0;
                return (
                  <div key={step.key} className="border-b border-border py-2">
                    <div className="flex justify-between text-sm">
                      <span>{step.label}</span>
                      <span className="text-muted-foreground">
                        {step.count}
                        {index > 0 && (
                          <>
                            {" · "}
                            {previous ? `${Math.round((step.count / previous) * 100)}%` : "—"}
                            {previous > step.count && (
                              <span className="text-destructive"> (−{previous - step.count})</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {query.isSuccess && segments.length === 0 && (
          <p className="text-muted-foreground">No invites in this range.</p>
        )}
      </div>
    </>
  );
}

/* ---------- 3. cohorts ---------- */

function CohortsTab({ includeTest }: { includeTest: boolean }) {
  const [activity, setActivity] = useState<"open" | "answer" | "message" | "session">("answer");
  const load = useServerFn(getCohorts);
  const query = useQuery({
    queryKey: ["admin-cohorts", activity, includeTest],
    queryFn: () => load({ data: { activity, includeTest, weeks: 12 } }),
    retry: false,
  });

  const rows = query.data ?? [];
  const maxWeek = rows.reduce(
    (max, row) => Math.max(max, ...row.cells.map((cell) => cell.week), 0),
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "Opened the app"],
            ["answer", "Answered a question"],
            ["message", "Sent a message"],
            ["session", "Started a session"],
          ] as const
        ).map(([key, label]) => (
          <Pill key={key} active={activity === key} onClick={() => setActivity(key)}>
            {label}
          </Pill>
        ))}
        <span className="ml-auto">
          <ExportButton
            onClick={() =>
              exportCsv(
                `nosure-cohorts-${activity}`,
                ["cohort", "size", "week", "active", "retention"],
                rows.flatMap((row) =>
                  row.cells.map((cell) => [
                    row.cohort,
                    row.size,
                    cell.week,
                    cell.active,
                    row.size ? cell.active / row.size : "",
                  ]),
                ),
              )
            }
          />
        </span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4">Cohort</th>
              <th className="py-2 pr-4">People</th>
              {Array.from({ length: maxWeek + 1 }, (_, week) => (
                <th key={week} className="py-2 pr-3">
                  W{week}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohort} className="border-t border-border">
                <td className="py-2 pr-4">{row.cohort}</td>
                <td className="py-2 pr-4">{row.size}</td>
                {Array.from({ length: maxWeek + 1 }, (_, week) => {
                  const cell = row.cells.find((c) => c.week === week);
                  const share = cell && row.size ? cell.active / row.size : null;
                  return (
                    <td key={week} className="py-2 pr-3">
                      {share === null ? (
                        <span className="text-muted-foreground">·</span>
                      ) : (
                        <span
                          className="rounded px-1.5 py-0.5"
                          style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(share * 60)}%, transparent)` }}
                        >
                          {Math.round(share * 100)}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-10 text-xl">Per cohort</h3>
      <div className="mt-3 flex flex-col">
        {rows.map((row) => (
          <div key={row.cohort} className="flex justify-between border-b border-border py-2 text-sm">
            <span>{row.cohort}</span>
            <span className="text-muted-foreground">
              median {num(row.medianSessions, 1)} sessions · median {num(row.medianPeople, 1)} people ·{" "}
              {pct(row.initiatorShare)} ever started one
            </span>
          </div>
        ))}
        {query.isSuccess && rows.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
      </div>
    </>
  );
}

/* ---------- 4. per-person timeline ---------- */

function PeopleTab({ includeTest }: { includeTest: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const loadPeople = useServerFn(getPeople);
  const loadTimeline = useServerFn(getPersonTimeline);

  const people = useQuery({
    queryKey: ["admin-people", search, includeTest],
    queryFn: () => loadPeople({ data: { q: search, includeTest } }),
    retry: false,
  });
  const timeline = useQuery({
    queryKey: ["admin-timeline", selected],
    queryFn: () => loadTimeline({ data: { personKey: selected! } }),
    enabled: Boolean(selected),
    retry: false,
  });

  const t = timeline.data;

  return (
    <div className="grid gap-8 md:grid-cols-[260px_1fr]">
      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
        <div className="mt-3 flex max-h-[70vh] flex-col overflow-y-auto">
          {(people.data ?? []).map((person) => (
            <button
              key={person.personKey}
              onClick={() => setSelected(person.personKey)}
              className={`border-b border-border py-2 text-left text-sm ${
                selected === person.personKey ? "text-primary" : ""
              }`}
            >
              <span>{person.name || "Someone"}</span>
              <span className="block text-xs text-muted-foreground">
                {person.identity} · {person.sessions} sessions · last{" "}
                {new Date(person.lastSeen).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!selected && <p className="text-muted-foreground">Pick a person to see their whole history.</p>}
        {selected && timeline.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {t && (
          <>
            <div className="card-soft px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl">{t.summary.name || "Someone"}</h2>
                <span className="text-xs text-muted-foreground">{t.personKey}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.summary.identity === "account"
                  ? "Registered account"
                  : t.summary.identity === "email"
                    ? "Email captured, no account"
                    : "Guest token only"}
                {t.summary.linked && " · was linked from an earlier guest identity"}
                {t.summary.participantRows > 1 && ` · ${t.summary.participantRows} participant rows`}
                {t.summary.emails.length > 0 && ` · ${t.summary.emails.join(", ")}`}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                First seen {t.summary.firstSeen ? new Date(t.summary.firstSeen).toLocaleString() : "—"} ·
                last seen {t.summary.lastSeen ? new Date(t.summary.lastSeen).toLocaleString() : "—"} · gap{" "}
                {secs(t.summary.gapSinceLastVisitSeconds)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.summary.sessions} sessions · {t.summary.distinctPeople} people ·{" "}
                {t.summary.messagesSent} sent / {t.summary.messagesReceived} received ·{" "}
                {t.summary.everInitiated ? "has started a session" : "only ever received"}
              </p>
              <div className="mt-3">
                <ExportButton
                  onClick={() =>
                    exportCsv(
                      `nosure-person-${t.personKey.slice(0, 8)}`,
                      ["session_id", "kind", "started_at", "question", "choice", "reason", "answered_at"],
                      t.sessions.flatMap((s) =>
                        s.questions.map((q) => [
                          s.sessionId,
                          s.kind,
                          s.startedAt,
                          q.text,
                          q.label,
                          q.reason ?? "",
                          q.answeredAt,
                        ]),
                      ),
                    )
                  }
                />
              </div>
            </div>

            {t.sessions.map((s) => (
              <div key={s.sessionId} className="mt-6 border-t border-border pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg">
                    {s.kind} with {s.others.join(", ") || "nobody yet"}
                    {s.isTest && <span className="text-muted-foreground"> · test</span>}
                  </h3>
                  <Link
                    to="/admin/s/$sessionId"
                    params={{ sessionId: s.sessionId }}
                    className="text-xs text-muted-foreground underline"
                  >
                    room
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(s.startedAt).toLocaleString()} · joined as {s.role}
                </p>
                <div className="mt-2 flex flex-col gap-1 text-sm">
                  {s.questions.map((q) => (
                    <div key={`${q.orderIndex}-${q.role}-${q.answeredAt}`}>
                      <span className="text-muted-foreground">Q{q.orderIndex + 1}</span> {q.text}
                      <span className="text-muted-foreground">
                        {" "}
                        → {q.label}
                        {q.role === "about_other" && " (guess)"}
                        {q.optionKey === "pass" && " (passed)"}
                        {q.hasReason ? ` · reason: ${q.reason}` : " · no reason"} ·{" "}
                        {new Date(q.answeredAt).toLocaleTimeString()}
                        {q.revealedAt && ` · revealed ${new Date(q.revealedAt).toLocaleTimeString()}`}
                      </span>
                    </div>
                  ))}
                  {s.messages.map((m, index) => (
                    <div key={`${m.at}-${index}`} className="text-muted-foreground">
                      {m.mine ? "→" : "←"} {m.body} ({m.chars} chars,{" "}
                      {new Date(m.at).toLocaleTimeString()})
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <h3 className="mt-8 text-lg">Raw events</h3>
            <div className="mt-2 flex flex-col text-sm">
              {t.events.map((e, index) => (
                <div key={`${e.at}-${index}`} className="flex justify-between gap-4 border-b border-border py-1">
                  <span>{e.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {JSON.stringify(e.props)} · {new Date(e.at).toLocaleString()}
                  </span>
                </div>
              ))}
              {t.events.length === 0 && <p className="text-muted-foreground">No events recorded.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 5. per-question ---------- */

type QuestionSortKey =
  | "threads"
  | "window"
  | "toAnswer"
  | "shown"
  | "answered"
  | "skip"
  | "pass"
  | "bridge"
  | "followUp";

function QuestionsTab({ includeTest }: { includeTest: boolean }) {
  const [sort, setSort] = useState<QuestionSortKey>("threads");
  const load = useServerFn(getQuestionPerformance);
  const query = useQuery({
    queryKey: ["admin-questions", includeTest],
    queryFn: () => load({ data: { includeTest } }),
    retry: false,
  });

  const value = (row: QuestionRow, key: QuestionSortKey) => {
    if (key === "threads") return row.threads;
    if (key === "window") return row.medianAnswerWindowSeconds ?? -1;
    if (key === "toAnswer") return row.medianSecondsToAnswer ?? -1;
    if (key === "shown") return row.timesShown;
    if (key === "answered") return row.timesAnswered;
    if (key === "skip") return row.skipRate ?? -1;
    if (key === "pass") return row.passRate ?? -1;
    if (key === "followUp") return row.followUpAnswerRate ?? -1;
    return row.bridgeTaps;
  };
  const rows = [...(query.data ?? [])].sort((a, b) => value(b, sort) - value(a, sort));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["threads", "Threads"],
            ["window", "Answer window"],
            ["toAnswer", "Time to answer"],
            ["shown", "Times shown"],
            ["answered", "Times answered"],
            ["skip", "Skip rate"],
            ["pass", "Pass rate"],
            ["bridge", "Bridge taps"],
            ["followUp", "Follow-up answered"],
          ] as const
        ).map(([key, label]) => (
          <Pill key={key} active={sort === key} onClick={() => setSort(key)}>
            {label}
          </Pill>
        ))}
        <span className="ml-auto">
          <ExportButton
            onClick={() =>
              exportCsv(
                "nosure-questions",
                [
                  "question",
                  "topic",
                  "type",
                  "spice",
                  "mode",
                  "times_shown",
                  "times_answered",
                  "skip_rate",
                  "pass_rate",
                  "split",
                  "median_answer_window_seconds",
                  "avg_answer_window_seconds",
                  "median_seconds_to_answer",
                  "threads",
                  "median_messages_per_thread",
                  "bridge_taps",
                  "mind_changed",
                  "follow_up",
                  "follow_up_shown",
                  "follow_up_answered",
                  "follow_up_answer_rate",
                ],
                rows.map((row) => [
                  row.text,
                  row.topic ?? "",
                  row.type,
                  row.spice,
                  row.mode,
                  row.timesShown,
                  row.timesAnswered,
                  row.skipRate ?? "",
                  row.passRate ?? "",
                  row.options.map((o) => `${o.label ?? o.key}:${o.votes}`).join(" / "),
                  row.medianAnswerWindowSeconds ?? "",
                  row.avgAnswerWindowSeconds ?? "",
                  row.medianSecondsToAnswer ?? "",
                  row.threads,
                  row.medianMessagesPerThread ?? "",
                  row.bridgeTaps,
                  row.mindChanged,
                  row.followUp ?? "",
                  row.followUpShown,
                  row.followUpAnswered,
                  row.followUpAnswerRate ?? "",
                ]),
              )
            }
          />
        </span>
      </div>

      <div className="mt-6 flex flex-col">
        {rows.map((row) => {
          const total = row.options.reduce((sum, option) => sum + option.votes, 0);
          return (
            <div key={row.questionId} className="border-b border-border py-3">
              <p>{row.text}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.topic ?? "no topic"} · {row.type} · spice {row.spice} · {row.mode}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.options
                  .map(
                    (o) =>
                      `${o.label ?? o.key} ${o.votes}${total ? ` (${Math.round((o.votes / total) * 100)}%)` : ""}`,
                  )
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                shown {row.timesShown} · answered {row.timesAnswered} · skip {pct(row.skipRate)} · pass{" "}
                {pct(row.passRate)} · window median {secs(row.medianAnswerWindowSeconds)} (lifetime avg{" "}
                {secs(row.avgAnswerWindowSeconds)}) · to answer {secs(row.medianSecondsToAnswer)} ·{" "}
                {row.threads} threads (median {num(row.medianMessagesPerThread, 1)} msgs) ·{" "}
                {row.bridgeTaps} bridge · {row.mindChanged} changed mind
              </p>
              {row.followUp && (
                <p className="mt-1 text-sm text-muted-foreground">
                  follow-up: "{row.followUp}" — shown {row.followUpShown} · answered{" "}
                  {row.followUpAnswered} ({pct(row.followUpAnswerRate)})
                </p>
              )}
            </div>
          );
        })}
        {query.isSuccess && rows.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
      </div>
    </>
  );
}

/* ---------- 6. per-session ---------- */

function SessionsTab({ range }: { range: Range }) {
  const load = useServerFn(getSessionRows);
  const mark = useServerFn(markSessionTest);
  const client = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [onlyStalled, setOnlyStalled] = useState(false);
  const [onlyTest, setOnlyTest] = useState(false);

  const query = useQuery({
    queryKey: ["admin-session-rows", range],
    queryFn: () => load({ data: range }),
    retry: false,
  });
  const flag = useMutation({
    mutationFn: (input: { sessionId: string; isTest: boolean; flagPeople: boolean }) =>
      mark({ data: input }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-session-rows"] }),
  });

  const rows = (query.data ?? [])
    .filter((row) => !onlyStalled || !row.reachedReveal)
    .filter((row) => !onlyTest || row.isTest);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={onlyStalled} onClick={() => setOnlyStalled(!onlyStalled)}>
          Never reached reveal
        </Pill>
        <Pill active={onlyTest} onClick={() => setOnlyTest(!onlyTest)}>
          Test rooms only
        </Pill>
        <span className="ml-auto">
          <ExportButton
            onClick={() =>
              exportCsv(
                "nosure-sessions",
                [
                  "session_id",
                  "kind",
                  "is_test",
                  "started_at",
                  "people",
                  "questions",
                  "revealed",
                  "reached_reveal",
                  "seconds_to_first_reveal",
                  "seconds_to_last_activity",
                  "end_shown",
                  "save_prompt_shown",
                  "emails_saved",
                  "dropouts",
                ],
                rows.map((row) => [
                  row.sessionId,
                  row.kind,
                  row.isTest,
                  row.startedAt,
                  row.people,
                  row.totalQuestions,
                  row.revealedQuestions,
                  row.reachedReveal,
                  row.secondsToFirstReveal ?? "",
                  row.secondsToLastActivity ?? "",
                  row.endShown,
                  row.savePromptShown,
                  row.emailsSaved,
                  row.participants
                    .filter((p) => p.answered < row.totalQuestions)
                    .map((p) => `${p.name}@Q${(p.lastAnsweredIndex ?? -1) + 1}`)
                    .join(" / "),
                ]),
              )
            }
          />
        </span>
      </div>

      <div className="mt-6 flex flex-col">
        {rows.map((row) => {
          const dropouts = row.participants.filter((p) => p.answered < row.totalQuestions);
          return (
            <div key={row.sessionId} className="border-b border-border py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <button
                  onClick={() => setOpen(open === row.sessionId ? null : row.sessionId)}
                  className="text-left"
                >
                  {new Date(row.startedAt).toLocaleString()}{" "}
                  <span className="text-muted-foreground">· {row.kind}</span>
                  {!row.reachedReveal && (
                    <span className="ml-2 rounded-full border border-destructive px-2 py-0.5 text-xs text-destructive">
                      never revealed
                    </span>
                  )}
                  {row.isTest && (
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      test
                    </span>
                  )}
                </button>
                <span className="text-sm text-muted-foreground">
                  {row.people} people · {row.revealedQuestions}/{row.totalQuestions} revealed · reveal in{" "}
                  {secs(row.secondsToFirstReveal)} · last activity {secs(row.secondsToLastActivity)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.endShown === 0 && row.savePromptShown === 0
                  ? "ending: not tracked"
                  : `ending reached ${row.endShown} · save step seen ${row.savePromptShown} · saved ${row.emailsSaved}`}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={row.isTest}
                    onChange={(e) =>
                      flag.mutate({
                        sessionId: row.sessionId,
                        isTest: e.target.checked,
                        flagPeople: e.target.checked,
                      })
                    }
                  />
                  test room (flags everyone in it)
                </label>
                <Link
                  to="/admin/s/$sessionId"
                  params={{ sessionId: row.sessionId }}
                  className="underline"
                >
                  full detail
                </Link>
                {dropouts.length > 0 && (
                  <span>
                    dropped:{" "}
                    {dropouts
                      .map((p) => `${p.name} after Q${(p.lastAnsweredIndex ?? -1) + 1}`)
                      .join(", ")}
                  </span>
                )}
              </div>
              {open === row.sessionId && (
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  {row.questions.map((q) => (
                    <div key={q.orderIndex} className="text-muted-foreground">
                      Q{q.orderIndex + 1} {q.text || "(no snapshot)"} ·{" "}
                      {q.split.map((s) => `${s.key}:${s.votes}`).join(" / ") || "no answers"} ·{" "}
                      {q.revealed ? "revealed" : "not revealed"} · {q.messages} messages
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {query.isSuccess && rows.length === 0 && (
          <p className="text-muted-foreground">No rooms in this range.</p>
        )}
      </div>
    </>
  );
}

/* ---------- 7. invites ---------- */

function InvitesTab({ range }: { range: Range }) {
  const load = useServerFn(getInviteReport);
  const query = useQuery({
    queryKey: ["admin-invites", range],
    queryFn: () => load({ data: range }),
    retry: false,
  });
  const report = query.data;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl">Note vs. no note</h2>
        <ExportButton
          onClick={() =>
            exportCsv(
              "nosure-invites",
              ["segment", "created", "opened", "completed", "median_to_open_s", "median_to_complete_s"],
              (report?.segments ?? []).map((s) => [
                s.segment,
                s.created,
                s.opened,
                s.completed,
                s.median_to_open ?? "",
                s.median_to_complete ?? "",
              ]),
            )
          }
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(report?.segments ?? []).map((s) => (
          <div key={s.segment} className="card-soft px-5 py-4">
            <h3 className="text-xl">{s.segment}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {s.created} sent · {s.opened} opened ({pct(s.created ? s.opened / s.created : null)}) ·{" "}
              {s.completed} completed ({pct(s.opened ? s.completed / s.opened : null)})
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              median send → open {secs(s.median_to_open)} · open → complete {secs(s.median_to_complete)}
            </p>
          </div>
        ))}
        {query.isSuccess && (report?.segments ?? []).length === 0 && (
          <p className="text-muted-foreground">No invites in this range.</p>
        )}
      </div>

      <h2 className="mt-10 text-2xl">Opened but abandoned</h2>
      <div className="mt-3 flex flex-col">
        {(report?.abandoned ?? []).map((invite) => (
          <div key={invite.token} className="flex justify-between border-b border-border py-2 text-sm">
            <span>
              {invite.label || "Someone"}{" "}
              <span className="text-muted-foreground">
                · {invite.hasNote ? "with note" : "no note"}
              </span>
            </span>
            <span className="text-muted-foreground">
              opened {new Date(invite.openedAt).toLocaleString()} · stopped at{" "}
              {invite.lastQuestionIndex === null
                ? "before Q1"
                : `Q${invite.lastQuestionIndex + 1}`}
            </span>
          </div>
        ))}
        {query.isSuccess && (report?.abandoned ?? []).length === 0 && (
          <p className="text-muted-foreground">None — everyone who opened finished.</p>
        )}
      </div>
    </>
  );
}

/* ---------- 8. notifications ---------- */

function NotificationsTab({ range }: { range: Range }) {
  const load = useServerFn(getNotificationReport);
  const query = useQuery({
    queryKey: ["admin-notifications", range],
    queryFn: () => load({ data: range }),
    retry: false,
  });
  const report = query.data;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl">By type</h2>
        <ExportButton
          onClick={() =>
            exportCsv(
              "nosure-notifications",
              ["type", "sent", "emailed", "read", "clicked", "click_through", "led_to_message"],
              (report?.byType ?? []).map((row) => [
                row.type,
                row.sent,
                row.emailed,
                row.read,
                row.clicked,
                row.clickThroughRate ?? "",
                row.ledToMessage,
              ]),
            )
          }
        />
      </div>

      <div className="mt-4 flex flex-col">
        {(report?.byType ?? []).map((row) => (
          <div key={row.type} className="border-b border-border py-3">
            <p className="capitalize">{row.type}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.sent} queued · {row.emailed} emailed · {row.read} read · {row.clicked} clicked (
              {pct(row.clickThroughRate)}) · {row.ledToMessage} led to a message within the hour
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-2xl">Email delivery</h2>
      <div className="mt-3 flex flex-col">
        {(report?.delivery ?? []).map((row) => (
          <div key={row.status} className="flex justify-between border-b border-border py-2 text-sm">
            <span>{row.status}</span>
            <span className="text-muted-foreground">{row.n}</span>
          </div>
        ))}
        {(report?.delivery ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No delivery events recorded in this range — sends, failures and bounces land here as they
            happen.
          </p>
        )}
      </div>
    </>
  );
}

/* ---------- impressions ---------- */

function ImpressionsTab({ includeTest }: { includeTest: boolean }) {
  const load = useServerFn(getAdminImpressions);
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminImpressions>> | null>(null);

  useEffect(() => {
    void load({ data: { includeTest } })
      .then(setData)
      .catch(() => setData(null));
  }, [load, includeTest]);

  if (!data) return <p className="mt-8 text-muted-foreground">Loading…</p>;

  return (
    <div className="mt-8">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Share pages opened" value={String(data.share.views)} />
        <Stat label="Tapped the invite" value={String(data.share.ctaTaps)} />
        <Stat label="Started after a view" value={String(data.share.startedAfterView)} />
        <Stat label="View to session" value={`${data.share.conversion}%`} />
      </div>

      <h2 className="mt-10 text-2xl">Mismatch rate</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        How often the guess differs from the self-answer. Low means the question tells nobody
        anything — cut it.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2">Question</th>
            <th className="py-2">Pairs</th>
            <th className="py-2">Mismatches</th>
            <th className="py-2">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.questions.map((row) => (
            <tr key={row.questionId} className="border-t border-border">
              <td className="py-2 pr-4">{row.text}</td>
              <td className="py-2">{row.answers}</td>
              <td className="py-2">{row.mismatches}</td>
              <td className="py-2">{Math.round(row.mismatchRate)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-2xl">Running out of impression questions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Fell back to an ordinary question {data.impressionFallbacks} times in the last 90 days.
      </p>
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2">Person</th>
            <th className="py-2">Seen</th>
            <th className="py-2">Bank</th>
          </tr>
        </thead>
        <tbody>
          {data.exhaustion.map((row) => (
            <tr key={row.personKey} className="border-t border-border">
              <td className="py-2 pr-4">{row.name || "Someone"}</td>
              <td className="py-2">{row.seen}</td>
              <td className="py-2">{row.bank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 10. testing ---------- */

function TestingTab() {
  const load = useServerFn(getTestIdentities);
  const add = useServerFn(addTestIdentityFn);
  const remove = useServerFn(removeTestIdentityFn);
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [thisDevice, setThisDevice] = useState("");

  useEffect(() => {
    setThisDevice(getGuestToken());
  }, []);

  const query = useQuery({
    queryKey: ["admin-test-identities"],
    queryFn: () => load({}),
    retry: false,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["admin-test-identities"] });

  const addOne = useMutation({
    mutationFn: (input: { kind: "email" | "guest_token"; value: string; note?: string }) =>
      add({ data: input }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });
  const dropOne = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
  });

  const rows: TestIdentity[] = (query.data ?? []) as TestIdentity[];
  const deviceFlagged = rows.some((row) => row.kind === "guest_token" && row.value === thisDevice);

  return (
    <div className="flex flex-col gap-8">
      <div className="card-soft px-6 py-5">
        <h2 className="text-xl">Test accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Any room with one of these people in it is marked as a test room automatically, and anyone
          who joins a test room afterwards gets flagged too — guests included.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-64 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
          />
          <button
            disabled={!email.trim() || addOne.isPending}
            onClick={() => addOne.mutate({ kind: "email", value: email.trim(), note: "test account" })}
            className="btn-ink px-4 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            Flag this account
          </button>
          <button
            disabled={!thisDevice || deviceFlagged || addOne.isPending}
            onClick={() =>
              addOne.mutate({ kind: "guest_token", value: thisDevice, note: "dashboard device" })
            }
            className="text-sm text-muted-foreground underline hover:text-primary disabled:opacity-50"
          >
            {deviceFlagged ? "This browser is flagged" : "Flag this browser"}
          </button>
          <Link to="/start" className="ml-auto text-sm underline">
            Start a test room
          </Link>
        </div>
      </div>

      <div>
        <h3 className="text-sm text-muted-foreground">Flagged ({rows.length})</h3>
        <div className="mt-3 flex flex-col">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 text-sm"
            >
              <span>
                <span className="text-muted-foreground">{row.kind.replace("_", " ")} · </span>
                {row.label ? `${row.label} · ` : ""}
                {row.value}
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {row.note ?? ""}
                <button onClick={() => dropOne.mutate(row.id)} className="underline hover:text-primary">
                  unflag
                </button>
              </span>
            </div>
          ))}
          {query.isSuccess && rows.length === 0 && (
            <p className="text-muted-foreground">Nobody is flagged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

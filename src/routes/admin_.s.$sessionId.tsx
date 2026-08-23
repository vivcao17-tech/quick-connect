import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAdminSessionDetail } from "@/lib/admin.functions";
import {
  downloadFile,
  exportFileName,
  sessionToCsv,
  sessionToJson,
  type ExportableSession,
} from "@/lib/admin-export";


export const Route = createFileRoute("/admin_/s/$sessionId")({
  component: SessionDetailPage,
  head: () => ({
    meta: [
      { title: "Room record — NoSure" },
      { name: "description", content: "Question-by-question record of one room." },
      { property: "og:title", content: "Room record — NoSure" },
      { property: "og:description", content: "Question-by-question record of one room." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function secs(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${value}s`;
  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

const SPLIT_LABEL: Record<string, string> = {
  even: "even",
  leaning: "leaning",
  lopsided: "lopsided",
};

function Bar({ options }: { options: { key: string; label: string; votes: number }[] }) {
  const total = options.reduce((a, o) => a + o.votes, 0);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {options.map((option) => {
        const width = total ? Math.round((option.votes / total) * 100) : 0;
        return (
          <div key={option.key} className="flex items-center gap-3">
            <span className="w-44 shrink-0 text-sm">{option.label}</span>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm text-muted-foreground">
              {option.votes} · {total ? `${width}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const [sortBy, setSortBy] = useState<"order" | "closeness" | "window">("order");
  const load = useServerFn(getAdminSessionDetail);
  const query = useQuery({
    queryKey: ["admin-session", sessionId],
    queryFn: () => load({ data: { sessionId } }),
    retry: false,
  });

  const detail = query.data;
  const questions = detail
    ? [...detail.questions].sort((a, b) => {
        if (sortBy === "closeness")
          return (a.imbalance ?? 2) - (b.imbalance ?? 2) || a.orderIndex - b.orderIndex;
        if (sortBy === "window")
          return (
            (b.answerWindowSeconds ?? -1) - (a.answerWindowSeconds ?? -1) ||
            a.orderIndex - b.orderIndex
          );
        return a.orderIndex - b.orderIndex;
      })
    : [];


  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/admin" className="text-sm text-muted-foreground underline">
          Back to dashboard
        </Link>

        {query.isLoading && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {query.isError && (
          <p className="mt-10 text-muted-foreground">
            This page is for the account listed in ADMIN_EMAILS. Sign in with that address.
          </p>
        )}
        {query.isSuccess && !detail && (
          <p className="mt-10 text-muted-foreground">No room with that id.</p>
        )}

        {detail && (
          <>
            <h1 className="mt-6 text-4xl">{detail.kind} room</h1>
            <p className="mt-3 text-muted-foreground">
              {new Date(detail.createdAt).toLocaleString()} · {secs(detail.durationSeconds)} ·{" "}
              {detail.participants.length} {detail.participants.length === 1 ? "person" : "people"}
            </p>
            {detail.participants.length > 0 && (
              <p className="mt-1 text-muted-foreground">{detail.participants.join(", ")}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full border border-border px-3 py-1">
                {detail.evenCount} close to even
              </span>
              <span className="rounded-full border border-border px-3 py-1">
                {detail.lopsidedCount} lopsided
              </span>
              <button
                onClick={() => setByCloseness((value) => !value)}
                className="rounded-full border border-primary px-3 py-1 text-primary"
              >
                {byCloseness ? "Sort in play order" : "Sort by closeness"}
              </button>
              <button
                onClick={() => {
                  const record = detail as unknown as ExportableSession;
                  downloadFile(exportFileName(record, "csv"), sessionToCsv(record), "text/csv");
                }}
                className="rounded-full border border-border px-3 py-1"
              >
                Download CSV
              </button>
              <button
                onClick={() => {
                  const record = detail as unknown as ExportableSession;
                  downloadFile(
                    exportFileName(record, "json"),
                    sessionToJson(record),
                    "application/json",
                  );
                }}
                className="rounded-full border border-border px-3 py-1"
              >
                Download JSON
              </button>
            </div>


            <div className="mt-10 flex flex-col gap-4">
              {questions.map((question) => (
                <div key={question.sessionQuestionId} className="card-soft px-6 py-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-lg">
                      <span className="text-muted-foreground">Q{question.orderIndex + 1}. </span>
                      {question.text}
                    </p>
                    {question.split && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {SPLIT_LABEL[question.split]}
                      </span>
                    )}
                  </div>

                  {question.skipped ? (
                    <p className="mt-3 text-sm text-muted-foreground">Skipped — never revealed.</p>
                  ) : (
                    <>
                      {question.selfOptions && (
                        <p className="mt-3 text-sm text-muted-foreground">Guesses about the other</p>
                      )}
                      <Bar options={question.options} />
                      {question.selfOptions && (
                        <>
                          <p className="mt-4 text-sm text-muted-foreground">Answers about self</p>
                          <Bar options={question.selfOptions} />
                        </>
                      )}
                      <p className="mt-4 text-sm text-muted-foreground">
                        {question.totalVotes} answers · {secs(question.secondsOnQuestion)} on this
                        question · {secs(question.answerWindowSeconds)} between first and last answer
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

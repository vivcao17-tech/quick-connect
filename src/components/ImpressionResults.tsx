import { useState } from "react";
import type { getMyImpressions } from "@/lib/know.functions";

type Result = NonNullable<Awaited<ReturnType<typeof getMyImpressions>>>;

export function ImpressionResults({ data }: { data: Result }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const questions = data.questions ?? [];
  const guessers = data.guessers ?? [];
  const most = [...questions].filter((q) => q.total && q.wrong).sort((a, b) => b.wrong - a.wrong)[0];
  if (!guessers.length) return null;
  const label = (q: (typeof questions)[number], key: string | null | undefined) =>
    key === "a" ? q.optionA : key === "b" ? q.optionB : "—";

  return (
    <section className="mt-8">
      <h2 className="text-2xl">How your friends read you</h2>
      {most && <p className="mt-3 text-sm text-muted-foreground">Most missed: {most.text}…</p>}
      {guessers.length < 3 ? (
        <div className="mt-5 space-y-6">
          {questions.map((q) => (
            <div key={q.key} className="border-b border-border pb-5">
              <h3 className="text-lg">{q.text}…</h3>
              <p className="mt-2 text-sm text-muted-foreground">You answered: {label(q, q.self)}</p>
              {guessers.map((person, index) => (
                <p key={index} className="mt-2 text-sm">{person.name} guessed: {label(q, person.picks[q.key])}</p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[500px]">
            <div className="grid gap-2 border-b border-border pb-3 text-xs text-muted-foreground" style={{ gridTemplateColumns: `minmax(100px, 1.2fr) repeat(${questions.length}, minmax(68px, 1fr))` }}>
              <span>Friend</span>{questions.map((q, i) => <span key={q.key}>Q{i + 1}</span>)}
            </div>
            {guessers.map((person, i) => (
              <div key={i} className="grid gap-2 border-b border-border py-3 text-sm" style={{ gridTemplateColumns: `minmax(100px, 1.2fr) repeat(${questions.length}, minmax(68px, 1fr))` }}>
                <span className="truncate">{person.name}</span>
                {questions.map((q) => <button key={q.key} type="button" title={`${q.text}: ${label(q, person.picks[q.key])}`} onClick={() => setExpanded(expanded === q.key ? null : q.key)} className="text-left text-primary underline underline-offset-2">{person.picks[q.key] ? label(q, person.picks[q.key]) : "—"}</button>)}
              </div>
            ))}
          </div>
          {expanded && questions.filter((q) => q.key === expanded).map((q) => <div key={q.key} className="mt-5 border-t border-border pt-4 text-sm"><p>{q.text}…</p><p className="mt-2 text-muted-foreground">A: {q.optionA} · B: {q.optionB}</p></div>)}
        </div>
      )}
    </section>
  );
}
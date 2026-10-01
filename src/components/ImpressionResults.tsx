import { useState } from "react";
import type { getMyImpressions } from "@/lib/know.functions";

type Result = NonNullable<Awaited<ReturnType<typeof getMyImpressions>>>;

/** Owner-only view, grouped by what the guesses reveal. */
export function ImpressionResults({ data }: { data: Result }) {
  const [openRight, setOpenRight] = useState(false);
  const questions = data.questions ?? [];
  const guessers = data.guessers ?? [];
  if (!guessers.length) return null;
  const label = (q: (typeof questions)[number], key: string | null | undefined) =>
    key === "a" ? q.optionA : key === "b" ? q.optionB : "—";
  const stem = (q: (typeof questions)[number]) => q.ownerText ?? q.text;

  const answered = questions.filter((q) => q.total > 0 && q.self);
  const allWrong = answered.filter((q) => q.wrong === q.total);
  const allRight = answered.filter((q) => q.wrong === 0);
  const split = guessers.length >= 2 ? answered.filter((q) => q.wrong > 0 && q.wrong < q.total) : [];

  return (
    <div className="mt-6 space-y-8">
      {allWrong.length > 0 && (
        <section>
          <h2 className="text-xl">Everyone got this wrong</h2>
          <div className="mt-3 space-y-4">
            {allWrong.map((q) => (
              <div key={q.key} className="card-soft border-primary px-4 py-4">
                <p className="text-base">{stem(q)}</p>
                <p className="mt-3 text-lg">You: <span className="font-semibold">{label(q, q.self)}</span></p>
                <p className="mt-1 text-sm text-muted-foreground line-through decoration-primary">
                  They guessed: {label(q, q.self === "a" ? "b" : "a")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {split.length > 0 && (
        <section>
          <h2 className="text-xl">They don't agree on this</h2>
          <div className="mt-3 space-y-4">
            {split.map((q) => (
              <div key={q.key} className="border-b border-border pb-4">
                <p className="text-base">{stem(q)}</p>
                <p className="mt-2 text-sm">You: <span className="font-semibold">{label(q, q.self)}</span></p>
                {(["a", "b"] as const).map((k) => {
                  const names = guessers.filter((g) => g.picks[q.key] === k).map((g) => g.name);
                  return names.length ? (
                    <p key={k} className="mt-1 text-sm text-muted-foreground">
                      {label(q, k)}: {names.join(", ")}
                    </p>
                  ) : null;
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {allRight.length > 0 && (
        <section>
          <button type="button" onClick={() => setOpenRight((v) => !v)} className="w-full text-left">
            <h2 className="text-xl">They all read you right</h2>
            {!openRight && (
              <p className="mt-2 text-sm text-muted-foreground">{allRight.map(stem).join(" · ")}</p>
            )}
          </button>
          {openRight && (
            <div className="mt-3 space-y-3">
              {allRight.map((q) => (
                <div key={q.key} className="border-b border-border pb-3 text-sm">
                  <p>{stem(q)}</p>
                  <p className="mt-1 text-muted-foreground">You and everyone: {label(q, q.self)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

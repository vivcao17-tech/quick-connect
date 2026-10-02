import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PersonImpressionView } from "@/components/PersonImpressionView";
import { logClientCardEvent } from "@/lib/card-events.functions";
import type { getMyImpressions } from "@/lib/know.functions";
import { readLocalViewer } from "@/lib/viewer";

type Result = NonNullable<Awaited<ReturnType<typeof getMyImpressions>>>;

/** Owner-only view, grouped by what the guesses reveal. */
export function ImpressionResults({ data }: { data: Result }) {
  const [openRight, setOpenRight] = useState(false);
  const [view, setView] = useState<"person" | "question" | null>(null);
  const logEvent = useServerFn(logClientCardEvent);
  const questions = data.questions ?? [];
  const guessers = data.guessers ?? [];
  if (!guessers.length) return null;
  const selectedView = view ?? (guessers.length >= 3 ? "person" : "question");
  const sendFollowup = (name: string) => {
    const message = `Hey ${name.split(/\s+/)[0]}, why did you see me that way?`;
    void readLocalViewer()
      .then((viewer) => logEvent({ data: { event: "followup_tapped", token: data.token, ...viewer, meta: { guesser: name } } }))
      .catch(() => undefined);
    if (typeof navigator.share === "function") {
      void navigator.share({ text: message }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(message).catch(() => undefined);
    }
  };
  const label = (q: (typeof questions)[number], key: string | null | undefined) =>
    key === "a" ? q.optionA : key === "b" ? q.optionB : "—";
  const stem = (q: (typeof questions)[number]) => q.ownerText ?? q.text;

  const answered = questions.filter((q) => q.total > 0 && q.self);
  const allWrong = answered.filter((q) => q.wrong === q.total);
  const allRight = answered.filter((q) => q.wrong === 0);
  const split = guessers.length >= 2 ? answered.filter((q) => q.wrong > 0 && q.wrong < q.total) : [];

  return (
    <div className="mt-6 space-y-8">
      <div role="tablist" aria-label="Results view" className="flex gap-1 border-b border-border">
        <Button type="button" role="tab" aria-selected={selectedView === "person"} variant="ghost" onClick={() => setView("person")} className={`rounded-none border-b-2 px-4 ${selectedView === "person" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>By person</Button>
        <Button type="button" role="tab" aria-selected={selectedView === "question"} variant="ghost" onClick={() => setView("question")} className={`rounded-none border-b-2 px-4 ${selectedView === "question" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>By question</Button>
      </div>
      {selectedView === "person" ? (
        <PersonImpressionView questions={questions.map((q) => ({ ...q, text: q.ownerText ?? q.text }))} guessers={guessers} onFollowup={sendFollowup} onTagExpanded={(key) => { void readLocalViewer().then((viewer) => logEvent({ data: { event: "tag_expanded", token: data.token, ...viewer, meta: { question_key: key } } })).catch(() => undefined); }} />
      ) : <>
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
          <Button type="button" variant="ghost" onClick={() => setOpenRight((v) => !v)} className="h-auto w-full flex-col items-start whitespace-normal px-0 text-left">
            <h2 className="text-xl">They all read you right</h2>
            {!openRight && (
              <p className="mt-2 text-sm text-muted-foreground">{allRight.map(stem).join(" · ")}</p>
            )}
          </Button>
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
      </>}
    </div>
  );
}

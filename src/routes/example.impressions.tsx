import { createFileRoute, Link } from "@tanstack/react-router";

import { exampleImpressions, type ExampleImpression } from "@/lib/example-data";

export const Route = createFileRoute("/example/impressions")({
  head: () => ({
    meta: [
      { title: "Example — How people read you — NoSure" },
      {
        name: "description",
        content: "A sample read: what friends guessed about Sam, next to what Sam said.",
      },
      { property: "og:title", content: "Example — How people read you — NoSure" },
      { property: "og:description", content: "What friends guessed, next to what you said." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExampleImpressions,
});

function mostMissed(questions: ExampleImpression[]) {
  return [...questions]
    .filter((q) => q.guessesA + q.guessesB > 0)
    .sort((a, b) => wrongOf(b) / totalOf(b) - wrongOf(a) / totalOf(a))[0];
}

function totalOf(q: ExampleImpression) {
  return q.guessesA + q.guessesB;
}

function wrongOf(q: ExampleImpression) {
  return q.self === "a" ? q.guessesB : q.guessesA;
}

function ExampleImpressions() {
  const { subjectName, questions } = exampleImpressions;
  const most = mostMissed(questions);

  return (
    <main className="paper min-h-screen bg-background pb-32">
      <section className="mx-auto max-w-xl px-6 py-12">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Example</p>
        <h1 className="mt-6 text-5xl leading-none">How people read you</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is what {subjectName} saw after friends guessed.
        </p>

        <div className="card-soft border-primary mt-8 px-5 py-4">
          <p className="text-base font-medium">This is an example.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Answer five questions about yourself, send the link, and this fills in with real
            guesses.
          </p>
        </div>

        {most && (
          <p className="mt-8 text-xl">
            {wrongOf(most)} of {totalOf(most)} people got this one wrong.
            <span className="mt-1 block text-base text-muted-foreground">{most.text}</span>
          </p>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {questions.map((q) => {
            const total = totalOf(q);
            const pctA = total > 0 ? Math.round((q.guessesA / total) * 100) : 50;
            return (
              <div
                key={q.key}
                className={`card-soft px-5 py-4 ${most?.key === q.key ? "border-primary" : ""}`}
              >
                <p className="text-lg">{q.text}</p>
                <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${pctA}%` }} />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 w-0.5 bg-foreground"
                    style={{ left: "calc(100% - 1px)" }}
                  />
                </div>
                <div className="mt-2 flex justify-between gap-4 text-sm">
                  <span className={q.self === "a" ? "text-primary" : "text-muted-foreground"}>
                    {q.optionA} · {q.guessesA}
                    {q.self === "a" && <span className="ml-1 font-medium">· you said</span>}
                  </span>
                  <span className={q.self === "b" ? "text-primary" : "text-muted-foreground"}>
                    {q.optionB} · {q.guessesB}
                    {q.self === "b" && <span className="ml-1 font-medium">· you said</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Space held below the bars for a multi-axis chart, not settled yet. */}

        <Link to="/know" className="btn-ink mt-12 inline-block">
          Start yours
        </Link>
      </section>
    </main>
  );
}

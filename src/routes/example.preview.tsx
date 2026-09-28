import { createFileRoute, Link } from "@tanstack/react-router";

import { examplePreview } from "@/lib/example-data";

export const Route = createFileRoute("/example/preview")({
  head: () => ({
    meta: [
      { title: "Example — Where you line up — NoSure" },
      {
        name: "description",
        content: "A sample round: two people's answers side by side, and where they match.",
      },
      { property: "og:title", content: "Example — Where you line up — NoSure" },
      { property: "og:description", content: "Two people's answers side by side." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExamplePreview,
});

function ExamplePreview() {
  const { partnerName, rows, summary } = examplePreview;

  return (
    <main className="paper min-h-screen bg-background pb-32">
      <section className="mx-auto max-w-xl px-6 py-12">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Example</p>
        <h1 className="mt-6 text-5xl leading-none">Where you line up</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is a finished round between two friends.
        </p>

        <div className="card-soft border-primary mt-8 px-5 py-4">
          <p className="text-base font-medium">This is an example.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Answer three questions with someone, both of you, and this is what you see at the end.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          {rows.map((row) => {
            const match = row.mine === row.theirs;
            return (
              <div
                key={row.key}
                className={`card-soft px-5 py-4 ${match ? "border-primary" : ""}`}
              >
                <p className="text-lg">{row.question}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                      You
                    </p>
                    <p
                      className={`mt-2 rounded-xl px-3 py-2 text-sm ${
                        match ? "bg-primary text-primary-foreground" : "bg-secondary"
                      }`}
                    >
                      {row.mine === "a" ? row.optionA : row.optionB}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                      {partnerName}
                    </p>
                    <p
                      className={`mt-2 rounded-xl px-3 py-2 text-sm ${
                        match ? "bg-primary text-primary-foreground" : "bg-secondary"
                      }`}
                    >
                      {row.theirs === "a" ? row.optionA : row.optionB}
                    </p>
                  </div>
                </div>
                <p
                  className={`mt-3 text-sm ${match ? "font-medium text-primary" : "text-muted-foreground"}`}
                >
                  {match ? "You matched" : "You split"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10">
          {summary.map((line) => (
            <p key={line} className="mt-2 text-xl leading-snug">
              {line}
            </p>
          ))}
        </div>

        {/* Space held below the summary for a multi-axis chart, not settled yet. */}

        <Link to="/start" className="btn-ink mt-12 inline-block">
          Try it with someone
        </Link>
      </section>
    </main>
  );
}

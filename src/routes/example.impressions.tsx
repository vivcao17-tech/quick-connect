import { createFileRoute, Link } from "@tanstack/react-router";

import { PersonImpressionView } from "@/components/PersonImpressionView";
import { exampleImpressions } from "@/lib/example-data";

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

function ExampleImpressions() {
  const { subjectName, questions, guessers } = exampleImpressions;

  return (
    <main className="paper min-h-screen bg-background pb-32">
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Example</p>
        <h1 className="mt-6 text-5xl leading-none">How people read you</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is what {subjectName} saw after friends guessed.
        </p>

        <p className="mt-8 text-sm font-medium text-primary">This is an example.</p>
        <div className="mt-6">
          <PersonImpressionView questions={questions} guessers={guessers} />
        </div>

        <Link to="/know" className="btn-ink mt-12 inline-block">
          Start yours
        </Link>
      </section>
    </main>
  );
}

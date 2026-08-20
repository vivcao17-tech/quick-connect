import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "NoSure — 3 questions, 30 seconds" },
      {
        name: "description",
        content:
          "Answer three questions, see where you land against someone else, then put the phone down and talk.",
      },
      { property: "og:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Answer three questions. Then talk about it.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Answer three questions. Then talk about it.",
      },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Home() {
  const navigate = useNavigate();

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>

        <h1 className="mt-8 text-6xl leading-[0.95] sm:text-7xl">
          Three questions.
          <br />
          <em className="italic text-primary">Then you talk.</em>
        </h1>

        <div className="mt-12">
          <button className="btn-ink hover:opacity-90" onClick={() => void navigate({ to: "/start" })}>
            Start
          </button>
          <p className="mt-3 text-sm text-muted-foreground">30 seconds, no account</p>
        </div>

        <Link
          to="/people"
          className="mt-16 self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          People
        </Link>
      </section>
    </main>
  );
}

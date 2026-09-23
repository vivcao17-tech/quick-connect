import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — NoSure" },
      {
        name: "description",
        content:
          "The rules for using NoSure: who can use it, your content, and what to expect from the service.",
      },
      { property: "og:title", content: "Terms of Service — NoSure" },
      {
        property: "og:description",
        content:
          "The rules for using NoSure: who can use it, your content, and what to expect from the service.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Terms of Service — NoSure" },
      {
        name: "twitter:description",
        content:
          "The rules for using NoSure: who can use it, your content, and what to expect from the service.",
      },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
});

function TermsPage() {
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Legal</p>
        <h1 className="mt-6 text-4xl leading-tight">Terms of Service</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: September 9, 2026</p>

        <p className="mt-8 text-lg leading-relaxed text-foreground">
          By using NoSure, you agree to these terms.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Using NoSure</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          You may use NoSure if you are 13 or older. If you're under 18, you should have your parent
          or guardian's permission.
        </p>
        <p className="mt-4 leading-relaxed text-foreground">
          You're responsible for what you write and send. Don't use NoSure to harass, threaten,
          impersonate, or harm anyone, to share content that's illegal or infringing, to break into
          or disrupt the service, or to scrape or copy it at scale.
        </p>
        <p className="mt-4 leading-relaxed text-foreground">
          We can suspend or remove access if someone uses NoSure in a way that harms other people or
          the service.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Your content</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          You keep ownership of what you write. By posting it, you give us permission to store,
          display, and process it as needed to run the service and provide its features — including
          showing your answers to the other people in a session, displaying aggregate impressions on
          your profile if you choose to show them, and using content to operate and improve NoSure.
        </p>
        <p className="mt-4 leading-relaxed text-foreground">
          If you delete something, we'll remove it from the service, though copies may remain in
          backups for a period.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Other people's content</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          Answers and messages come from other users. We don't verify them, and we're not
          responsible for them. Impressions on a profile are other people's readings of someone, not
          statements of fact.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">The service</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          NoSure is provided as-is. We don't promise it will always be available, error-free, or
          that data will never be lost. We may change or discontinue features.
        </p>
        <p className="mt-4 leading-relaxed text-foreground">
          To the extent the law allows, we're not liable for indirect or consequential damages, and
          our total liability is limited to the amount you've paid us in the past twelve months, or
          $100 if you haven't paid anything.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Changes</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          We may update these terms. If we make significant changes we'll say so in the app.
          Continuing to use NoSure means you accept the updated terms.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Governing law</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          These terms are governed by the laws of the State of California, without regard to
          conflict of law rules.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Contact</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          <a href="mailto:hello@nosure.app" className="text-primary underline underline-offset-4">
            hello@nosure.app
          </a>
        </p>

        <div className="mt-16 flex justify-start">
          <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
            Back home
          </Link>
        </div>
      </section>
    </main>
  );
}

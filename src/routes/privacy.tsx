import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — NoSure" },
      {
        name: "description",
        content: "What NoSure collects, who can see your answers, and how to delete your data.",
      },
      { property: "og:title", content: "Privacy Policy — NoSure" },
      {
        property: "og:description",
        content: "What NoSure collects, who can see your answers, and how to delete your data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Privacy Policy — NoSure" },
      {
        name: "twitter:description",
        content: "What NoSure collects, who can see your answers, and how to delete your data.",
      },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Legal</p>
        <h1 className="mt-6 text-4xl leading-tight">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: September 24, 2026</p>

        <p className="mt-8 text-lg leading-relaxed text-foreground">
          NoSure is a service for answering questions alongside people you know and comparing your
          answers. This policy explains what we collect and what we do with it.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">What we collect</h2>

        <h3 className="mt-6 text-lg font-medium">What you tell us</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>A display name</li>
          <li>Your answers to questions, including your reads on other people</li>
          <li>
            Optional written reasons, follow-up answers, and messages you send in a conversation
          </li>
          <li>An email address, if you choose to give one</li>
          <li>Private notes you write about people you've played with</li>
          <li>
            A phone number or Instagram handle, a school email, your availability, and your meetup
            form answers — collected when you sign up for a meetup
          </li>
        </ul>

        <h3 className="mt-6 text-lg font-medium">What happens automatically</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>
            Timestamps and basic activity records — when questions were answered, revealed, or
            skipped, and how long steps took
          </li>
          <li>A token stored in your browser so we can recognize your sessions on that device</li>
          <li>
            Standard technical information sent by your browser, such as IP address and browser type
          </li>
        </ul>

        <h3 className="mt-6 text-lg font-medium">What we don't collect</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>Location data</li>
          <li>Your contacts</li>
          <li>Anything from third-party advertising or analytics trackers</li>
        </ul>

        <h2 className="mt-10 text-2xl leading-tight">Who can see what</h2>

        <p className="mt-4 leading-relaxed text-foreground">
          <strong>Your answers</strong> are visible to the other people in that same session, and
          only after everyone has answered. Before that point they are not readable by anyone else.
        </p>

        <p className="mt-4 leading-relaxed text-foreground">
          <strong>Your reads on other people</strong> are shown to the person you read, and to
          others in that session, as part of the reveal.
        </p>

        <p className="mt-4 leading-relaxed text-foreground">
          <strong>Private notes</strong> you write about someone — nicknames, contact details, notes
          — are visible only to you. The person they're about never sees them.
        </p>

        <p className="mt-4 leading-relaxed text-foreground">
          <strong>Aggregate impressions</strong> may appear on your own profile page if you choose
          to display them. You control which questions appear there and whether the page is shared.
        </p>

        <p className="mt-4 leading-relaxed text-foreground">
          <strong>Email addresses</strong> are used to send you notifications and links back to your
          sessions. They are not shown to other users.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">How we use it</h2>
        <p className="mt-4 leading-relaxed text-foreground">We use what you provide to:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>Run the service — showing questions, revealing answers, and keeping your history</li>
          <li>Send you notifications about replies and sessions you're part of</li>
          <li>
            Help you find and display differences and similarities between yourself and other
            people, including on profile pages and in features relating to relationships,
            impressions and compatibility that we may add over time
          </li>
          <li>
            Understand how the service is used and improve it, including which questions work well
          </li>
        </ul>

        <h2 className="mt-10 text-2xl leading-tight">Who we share it with</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          We use these service providers, and they process data only to run NoSure on our behalf:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>
            <strong>Supabase</strong> — database and hosting
          </li>
          <li>
            <strong>Resend</strong> — sending email
          </li>
          <li>
            <strong>Lovable</strong> — application hosting
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-foreground">
          We do not sell your personal information. We may disclose information if legally required
          to do so, or in connection with a merger, acquisition, or sale of assets.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">How long we keep it</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          We keep your information while your account or history is active. Email us and we'll
          delete your data.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Your choices</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-foreground">
          <li>
            <strong>Delete your data</strong> — email us and we'll remove it
          </li>
          <li>
            <strong>Stop emails</strong> — every notification email has an unsubscribe link
          </li>
          <li>
            <strong>Your profile</strong> — you choose what appears on it and whether to share it
          </li>
          <li>
            <strong>Access or correct</strong> — email us
          </li>
        </ul>
        <p className="mt-4 leading-relaxed text-foreground">
          Depending on where you live, you may have additional rights over your data. Email us and
          we'll help.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Children</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          NoSure is not directed at children under 13, and we don't knowingly collect information
          from them. If you believe a child under 13 has given us information, email us and we'll
          delete it.
        </p>

        <h2 className="mt-10 text-2xl leading-tight">Changes</h2>
        <p className="mt-4 leading-relaxed text-foreground">
          We may update this policy. If we make significant changes we'll say so in the app.
          Continuing to use NoSure after a change means you accept the updated policy.
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

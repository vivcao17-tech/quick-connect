import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { trackVisit } from "@/lib/track";
import { useViewer } from "@/lib/viewer";

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
  const viewer = useViewer();

  // Return visits: the gap since this browser last opened the app.
  useEffect(() => {
    if (!viewer.ready) return;
    if (viewer.profileId) {
      const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("nosure.after_signin") : null;
      if (stored) window.sessionStorage.removeItem("nosure.after_signin");
      const destination = stored?.startsWith("/") && !stored.startsWith("//") ? stored : "/me";
      void navigate({ to: destination, replace: true });
      return;
    }
    trackVisit("home", viewer.profileId ? { profileId: viewer.profileId } : {});
  }, [navigate, viewer.ready, viewer.profileId]);

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>

        <h1 className="mt-8 text-6xl leading-[0.95] sm:text-7xl">
          Pick a side.
          <br />
          <em className="italic text-primary">See their side of you.</em>
        </h1>

        <div className="mt-12">
          <Button
            className="h-auto w-full rounded-full py-5 text-xl"
            onClick={() => void navigate({ to: "/know" })}
          >
            See how your friends read you
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            Answer five questions about yourself. Send the link. See who reads you right.
          </p>
          <Link
            to="/example/impressions"
            className="mt-6 inline-block text-lg font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            See an example →
          </Link>
        </div>
        <p className="mt-auto pt-16 text-center text-sm text-muted-foreground">Already have an account? <Link to="/auth" search={{ redirect: "/me" }} className="underline underline-offset-4">Sign in</Link></p>

        <footer className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/terms" className="underline underline-offset-4">
            Terms
          </Link>
          <Link to="/privacy" className="underline underline-offset-4">
            Privacy
          </Link>
          <a href="mailto:hello@nosure.app" className="underline underline-offset-4">
            Contact
          </a>
        </footer>
      </section>
    </main>
  );
}

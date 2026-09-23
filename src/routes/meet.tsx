import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppTabs } from "@/components/AppTabs";
import { MeetSignupForm, type MeetSignupValues } from "@/components/MeetSignupForm";
import { Button } from "@/components/ui/button";
import { getMeetForm, submitMeetSignup } from "@/lib/meet.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/meet")({
  component: MeetPage,
  head: () => ({
    meta: [
      { title: "Meet — NoSure" },
      { name: "description", content: "Join the next NoSure meetup for Berkeley students." },
      { property: "og:title", content: "Meet — NoSure" },
      { property: "og:description", content: "Join the next NoSure meetup for Berkeley students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function MeetPage() {
  const viewer = useViewer();
  const load = useServerFn(getMeetForm);
  const submitSignup = useServerFn(submitMeetSignup);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMeetForm>> | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!viewer.ready || !viewer.profileId) return;
    void load().then(setData).catch(() => setError("The meetup form isn't available right now."));
  }, [load, viewer.profileId, viewer.ready]);

  async function save(values: MeetSignupValues) {
    if (!viewer.profileId || !viewer.guestToken) throw new Error("Sign in again to continue.");
    await submitSignup({ data: { ...values, profileId: viewer.profileId, guestToken: viewer.guestToken } });
    setDone(true);
  }

  return (
    <main className="paper min-h-screen bg-background pb-28">
      <section className="mx-auto max-w-xl px-6 py-12">
        <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Meet</p>
        <h1 className="mt-5 text-5xl leading-tight">Meet people at Berkeley.</h1>
        <p className="mt-3 text-muted-foreground">Berkeley students only.</p>

        {viewer.ready && !viewer.profileId && (
          <div className="mt-10 border-t border-border pt-8">
            <p className="text-lg">Sign in before joining the meetup.</p>
            <Button asChild className="mt-4" size="lg"><Link to="/auth" search={{ redirect: "/meet" }}>Continue</Link></Button>
          </div>
        )}
        {!viewer.ready && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {error && <p className="mt-10 text-muted-foreground">{error}</p>}
        {viewer.profileId && !data && !error && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {data?.alreadySignedUp && !done && (
          <div className="mt-10 border-t border-border pt-8"><p className="text-2xl">You’re already in.</p><p className="mt-2 text-muted-foreground">I’ll text you Saturday with the details.</p></div>
        )}
        {data && !data.alreadySignedUp && !done && (
          <div className="mt-10"><MeetSignupForm questions={data.questions} slotLabel={data.event.slotLabel} onSubmit={save} /></div>
        )}
        {done && (
          <div className="mt-10 border-t border-border pt-8">
            <h2 className="text-4xl">You’re in.</h2>
            <p className="mt-3 text-lg">I’ll text you Saturday with the details.</p>
            <Link to="/start" className="mt-8 inline-block text-primary underline underline-offset-4">While you wait, guess something about a friend →</Link>
          </div>
        )}
      </section>
      <AppTabs />
    </main>
  );
}

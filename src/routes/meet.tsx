import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppTabs } from "@/components/AppTabs";
import { MeetSignupForm, type MeetSignupValues } from "@/components/MeetSignupForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMeetForm, getMeetLanding, joinMeetWaitlist, submitMeetSignup } from "@/lib/meet.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/meet")({
  validateSearch: (search: Record<string, unknown>) => ({ start: search["start"] === "1" }),
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
  const search = Route.useSearch();
  const loadLanding = useServerFn(getMeetLanding);
  const load = useServerFn(getMeetForm);
  const joinWaitlist = useServerFn(joinMeetWaitlist);
  const submitSignup = useServerFn(submitMeetSignup);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMeetForm>> | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [landing, setLanding] = useState<Awaited<ReturnType<typeof getMeetLanding>> | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    void loadLanding().then(setLanding).catch(() => setError("The meetup isn't available right now."));
  }, [loadLanding]);

  useEffect(() => {
    if (!landing) return;
    setClosed(Date.now() >= new Date(landing.event.signupDeadline).getTime());
  }, [landing]);

  useEffect(() => {
    if (!viewer.ready || !viewer.profileId) return;
    void load().then(setData).catch(() => setError("The meetup form isn't available right now."));
  }, [load, viewer.profileId, viewer.ready]);

  useEffect(() => {
    if (viewer.ready && viewer.profileId && search.start) setStarted(true);
  }, [search.start, viewer.profileId, viewer.ready]);

  async function save(values: MeetSignupValues) {
    if (!viewer.profileId || !viewer.guestToken) throw new Error("Sign in again to continue.");
    await submitSignup({ data: { ...values, profileId: viewer.profileId, guestToken: viewer.guestToken } });
    setDone(true);
  }

  async function start() {
    if (!viewer.profileId) {
      window.location.assign(`/auth?redirect=${encodeURIComponent("/meet?start=1")}`);
      return;
    }
    setStarted(true);
  }

  async function saveWaitlist(event: React.FormEvent) {
    event.preventDefault();
    await joinWaitlist({ data: { email: waitlistEmail } });
    setWaitlistDone(true);
  }

  return (
    <main className="paper min-h-screen bg-background pb-28">
      <section className="mx-auto max-w-xl px-6 py-12">
        <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Berkeley students only</p>
        {!started && !closed && <div className="mt-8">
          <h1 className="text-5xl leading-tight">Berkeley meetup · Sunday, Sept 27, 2 PM</h1>
          <p className="mt-8 text-xl leading-relaxed">Answer a few questions. I’ll put together a small group of people you’d probably get along with — 4 to 6 people, one afternoon, free.</p>
          <p className="mt-5 text-muted-foreground">Takes about 3 minutes. Signups close Friday 5 PM.</p>
          <Button className="mt-8" size="lg" onClick={() => void start()}>Start</Button>
        </div>}

        {closed && <div className="mt-8">
          <h1 className="text-4xl leading-tight">Signups are closed for Sunday.</h1>
          <p className="mt-4 text-lg">Leave your email and I’ll tell you about the next one.</p>
          {waitlistDone ? <p className="mt-8 text-primary">You’re on the list.</p> : <form className="mt-8 flex gap-3" onSubmit={(event) => void saveWaitlist(event)}><Input aria-label="Email" type="email" required value={waitlistEmail} onChange={(event) => setWaitlistEmail(event.target.value)} placeholder="you@example.com" className="min-w-0 flex-1 rounded-full" /><Button type="submit">Let me know</Button></form>}
        </div>}

        {!viewer.ready && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {error && <p className="mt-10 text-muted-foreground">{error}</p>}
        {started && viewer.profileId && !data && !error && !closed && <p className="mt-10 text-muted-foreground">Loading…</p>}
        {started && data?.alreadySignedUp && !done && !closed && (
          <div className="mt-10 border-t border-border pt-8"><p className="text-2xl">You’re already in.</p><p className="mt-2 text-muted-foreground">I’ll text you Saturday with the details.</p></div>
        )}
        {started && data && !data.alreadySignedUp && !done && !closed && (
          <div className="mt-10"><MeetSignupForm questions={data.questions} slotLabel={data.event.slotLabel} onSubmit={save} /></div>
        )}
        {done && !closed && (
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

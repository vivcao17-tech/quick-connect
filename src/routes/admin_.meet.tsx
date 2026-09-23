import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { MeetSignupForm, type MeetSignupValues } from "@/components/MeetSignupForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { addAdminMeetSignup, getAdminMeet, updateMeetEvent } from "@/lib/meet.functions";

export const Route = createFileRoute("/admin/meet")({
  component: AdminMeetPage,
  head: () => ({
    meta: [
      { title: "Meet signups — NoSure" },
      { name: "description", content: "Private meetup signup administration." },
      { property: "og:title", content: "Meet signups — NoSure" },
      { property: "og:description", content: "Private meetup signup administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const signupLabels = {
  priority: { fits: "Fits naturally into how I already live", different: "Pulls me into things I wouldn’t normally do" },
  friendRead: { guess: "Their guess about what you’d do", impression: "What they think you’re like", neither: "I’d rather not hear either" },
  meetingStyle: { online: "Keep it online", one: "Meet one-on-one", group: "Meet in a small group" },
  weekly: { come: "I’d come", maybe: "Maybe", probably_not: "Probably not" },
} as const;

function pacificInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const take = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${take("year")}-${take("month")}-${take("day")}T${take("hour")}:${take("minute")}`;
}

function pacificToIso(local: string) {
  const [date, time] = local.split("T");
  const [year, month, day] = (date ?? "").split("-").map(Number);
  const [hour, minute] = (time ?? "").split(":").map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = pacificInput(new Date(guess).toISOString());
    const shownMs = Date.parse(`${shown}:00Z`);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    guess += targetMs - shownMs;
  }
  return new Date(guess).toISOString();
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function AdminMeetPage() {
  const load = useServerFn(getAdminMeet);
  const add = useServerFn(addAdminMeetSignup);
  const updateEvent = useServerFn(updateMeetEvent);
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");
  const query = useQuery({ queryKey: ["admin-meet"], queryFn: () => load(), retry: false });
  const data = query.data;
  const [slotLabel, setSlotLabel] = useState("");
  const [startsAt, setStartsAt] = useState("");

  const saveEvent = useMutation({
    mutationFn: () => {
      if (!data) throw new Error("Meetup unavailable");
      return updateEvent({ data: { eventId: data.event.id, slotLabel: slotLabel || data.event.slotLabel, startsAt: pacificToIso(startsAt || pacificInput(data.event.startsAt)) } });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-meet"] }),
  });

  if (query.isLoading) return <main className="paper min-h-screen bg-background px-6 py-14"><p className="text-muted-foreground">Loading…</p></main>;
  if (query.isError || !data) return <main className="paper min-h-screen bg-background px-6 py-14"><p>Not available. <Link to="/auth" search={{ redirect: "/admin/meet" }} className="underline">Sign in</Link></p></main>;

  const exportText = data.signups.map((signup) => {
    const sa = signup.signupAnswers as Record<string, string>;
    const oa = signup.openAnswers as Record<string, string>;
    return [
      `${signup.firstName} #${signup.signupNumber}`,
      ...signup.answers.map((answer) => `${answer.position}. ${answer.text} — ${answer.option}`),
      `11. You’d rather meet someone who — ${signupLabels.priority[sa["priority"] as keyof typeof signupLabels.priority] ?? sa["priority"]}`,
      `12. If a friend told you one thing about you — ${signupLabels.friendRead[sa["friendRead"] as keyof typeof signupLabels.friendRead] ?? sa["friendRead"]}`,
      `13. To meet new people, you’d — ${signupLabels.meetingStyle[sa["meetingStyle"] as keyof typeof signupLabels.meetingStyle] ?? sa["meetingStyle"]}`,
      `14. If this happened every week — ${signupLabels.weekly[sa["weekly"] as keyof typeof signupLabels.weekly] ?? sa["weekly"]}`,
      `15. What’s something you’re into, and what you like about it? — ${oa["interests"] ?? ""}`,
      `16. What’s one thing you wish was easier about meeting people at Berkeley? — ${oa["easier"] || "—"}`,
      `17. Someone you wanted to get to know better but never did — ${oa["missedConnection"] || "—"}`,
      `Availability — ${signup.availability}`,
    ].join("\n");
  }).join("\n\n");

  async function addPaper(values: MeetSignupValues) {
    await add({ data: values });
    setAdding(false);
    await client.invalidateQueries({ queryKey: ["admin-meet"] });
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h1 className="text-4xl">Meet signups</h1><Link to="/admin" className="text-sm underline">Dashboard</Link></div>
        <div className="mt-8 grid gap-3 border-y border-border py-5 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">Availability label<Input className="mt-1" value={slotLabel || data.event.slotLabel} onChange={(e) => setSlotLabel(e.target.value)} /></label>
          <label className="text-sm">Pacific date and time<Input className="mt-1" type="datetime-local" value={startsAt || pacificInput(data.event.startsAt)} onChange={(e) => setStartsAt(e.target.value)} /></label>
          <Button className="self-end" onClick={() => saveEvent.mutate()} disabled={saveEvent.isPending}>Save time</Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => void copyText(exportText).then(() => setCopied("Export copied"))}>Export signups</Button>
          <Button variant="outline" onClick={() => void copyText(data.signups.map((signup) => signup.contact).join(", ")).then(() => setCopied("Contacts copied"))}>Copy contacts</Button>
          <Button variant="outline" onClick={() => setAdding(!adding)}>{adding ? "Close paper form" : "Add paper signup"}</Button>
          {copied && <span className="self-center text-sm text-muted-foreground">{copied}</span>}
        </div>

        {adding && <div className="mt-10 border-t border-border pt-8"><h2 className="mb-8 text-3xl">Paper signup</h2><MeetSignupForm questions={data.questions} slotLabel={data.event.slotLabel} submitLabel="Save paper signup" onSubmit={addPaper} /></div>}

        <div className="mt-10 space-y-8">
          {data.signups.map((signup) => (
            <article key={signup.id} className="border-t border-border pt-5">
              <h2 className="text-2xl">{signup.firstName} #{signup.signupNumber}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{signup.contact} · {signup.berkeleyEmail} · {signup.availability} · {signup.source}</p>
              <ol className="mt-4 space-y-2 text-sm">
                {signup.answers.map((answer) => <li key={answer.position}><span className="text-muted-foreground">{answer.position}.</span> {answer.text} — <strong>{answer.option}</strong></li>)}
              </ol>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-muted-foreground">{JSON.stringify(signup.signupAnswers, null, 2)}</pre>
              <div className="mt-3 space-y-2 text-sm"><p><strong>Into:</strong> {(signup.openAnswers as Record<string, string>)["interests"]}</p><p><strong>Easier:</strong> {(signup.openAnswers as Record<string, string>)["easier"] || "—"}</p><p><strong>Missed connection:</strong> {(signup.openAnswers as Record<string, string>)["missedConnection"] || "—"}</p></div>
            </article>
          ))}
          {data.signups.length === 0 && <p className="text-muted-foreground">No signups yet.</p>}
        </div>
      </section>
    </main>
  );
}
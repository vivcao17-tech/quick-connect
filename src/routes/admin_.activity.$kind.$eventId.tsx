import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getCardIdentityEvents } from "@/lib/card-events.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin_/activity/$kind/$eventId")({
  component: ActivityPage,
  head: () => ({ meta: [
    { title: "Person activity — NoSure" },
    { name: "description", content: "Private event history for one person." },
    { property: "og:title", content: "Person activity — NoSure" },
    { property: "og:description", content: "Private event history for one person." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
});

function ActivityPage() {
  const { kind, eventId } = Route.useParams();
  const load = useServerFn(getCardIdentityEvents);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => setSignedIn(false));
  }, []);
  const query = useQuery({
    queryKey: ["admin-activity", kind, eventId],
    queryFn: () => load({ data: { eventId, kind: kind as "guest" | "user" } }),
    enabled: signedIn === true && (kind === "guest" || kind === "user"),
    retry: false,
  });
  const rows = query.data?.events ?? [];
  const sessions: (typeof rows)[] = [];
  for (const event of rows) {
    const current = sessions[sessions.length - 1];
    const last = current?.[current.length - 1];
    if (!last || new Date(last.at).getTime() - new Date(event.at).getTime() > 30 * 60 * 1000) sessions.push([event]);
    else current.push(event);
  }
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <Link to="/admin" className="text-sm text-primary underline underline-offset-4">Back to dashboard</Link>
        <h1 className="mt-8 text-4xl">Person activity</h1>
        {signedIn === false && <p className="mt-6">Sign in to see this page. <Link to="/auth" search={{ redirect: `/admin/activity/${kind}/${eventId}` }} className="text-primary underline">Sign in</Link></p>}
        {signedIn && (query.isLoading || signedIn === null) && <p className="mt-6 text-muted-foreground">Loading…</p>}
        {(query.isError || (signedIn && kind !== "guest" && kind !== "user")) && <p className="mt-6 text-muted-foreground">This activity isn't available.</p>}
        {query.data === null && <p className="mt-6 text-muted-foreground">No activity found.</p>}
        {query.data && <>
          <p className="mt-4 break-all text-sm">{query.data.name ? `${query.data.name} (${query.data.identifier.slice(0, 4)})` : `${query.data.kind} (${query.data.identifier.slice(0, 8)})`}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{query.data.kind}: {query.data.identifier}</p>
          <p className="mt-8 text-sm text-muted-foreground">{rows.length} events · {sessions.length} sessions</p>
          <div className="mt-5 space-y-3">
            {sessions.map((session, i) => (
              <details key={session[0]?.id ?? i} className="border-t border-border py-3">
                <summary className="cursor-pointer text-base font-medium">{new Date(session[session.length - 1]?.at ?? "").toLocaleString()} · {session.length} {session.length === 1 ? "event" : "events"}</summary>
                <div className="mt-4 space-y-3">
                  {session.map((event) => (
                    <div key={event.id} className="border-b border-border pb-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2"><span className="font-mono">{event.event}</span><time className="text-muted-foreground">{new Date(event.at).toLocaleString()}</time></div>
                      <p className="mt-1 text-muted-foreground">Card: {event.card ?? "—"}</p>
                      {event.meta != null && <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(event.meta, null, 2)}</pre>}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>}
      </section>
    </main>
  );
}
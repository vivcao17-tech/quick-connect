import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppTabs } from "@/components/AppTabs";
import { ImpressionResults } from "@/components/ImpressionResults";
import { getMyImpressions } from "@/lib/know.functions";
import { logClientCardEvent } from "@/lib/card-events.functions";
import { readLocalViewer } from "@/lib/viewer";

export const Route = createFileRoute("/me_/impressions")({
  component: ImpressionsPage,
  head: () => ({
    meta: [
      { title: "How people read you — NoSure" },
      { name: "description", content: "What your friends guessed about you, next to what you said." },
      { property: "og:title", content: "How people read you — NoSure" },
      { property: "og:description", content: "What your friends guessed, next to what you said." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof getMyImpressions>>;

function ImpressionsPage() {
  const load = useServerFn(getMyImpressions);
  const logEvent = useServerFn(logClientCardEvent);
  const [data, setData] = useState<Data | undefined>(undefined);

  useEffect(() => {
    void readLocalViewer()
      .then(async (v) => ({ r: await load({ data: { ...v, markSeen: true } }), v }))
      .then(({ r, v }) => {
        setData(r);
        if (r) void logEvent({ data: { event: "results_viewed", token: r.token, ...v } }).catch(() => undefined);
        window.dispatchEvent(new Event("nosure:impressions-seen"));
      })
      .catch(() => setData(null));
  }, [load, logEvent]);

  const qs = data?.questions ?? [];
  const most = undefined as (typeof qs)[number] | undefined;
  const count = data?.guessCount ?? 0;

  return (
    <main className="paper min-h-screen bg-background pb-32">
      <section className="mx-auto max-w-xl px-6 py-12">
        <Link to="/me" className="text-sm text-muted-foreground underline underline-offset-4">Back</Link>
        <h1 className="mt-6 text-5xl leading-none">
          {count > 0 ? `${count} ${count === 1 ? "person has" : "people have"} read you` : "How people read you"}
        </h1>

        {data === undefined && <p className="mt-10 text-muted-foreground">One moment…</p>}
        {data === null && (
          <div className="mt-10">
            <p className="text-lg">You haven't made a card yet.</p>
            <Link to="/know" className="btn-ink mt-6 inline-block">Make your card</Link>
          </div>
        )}

        {data && (
          <>
            <p className="card-soft mt-8 break-all px-5 py-4 text-sm">nosure.app/guess/{data.token}</p>
            {data.guessCount === 0 && <p className="mt-8 text-muted-foreground">Nobody has guessed yet. Send the link to a few people.</p>}
            <ImpressionResults data={data} />
            {false && <div className="mt-8 flex flex-col gap-4">
              {qs.map((q) => (
                <div key={q.key} className={`card-soft px-5 py-4 ${most?.key === q.key ? "border-primary" : ""}`}>
                  <p className="text-lg">{q.text}…</p>
                  {(["a", "b"] as const).map((k) => (
                    <div key={k} className="mt-2 flex justify-between text-base">
                      <span>
                        {k === "a" ? q.optionA : q.optionB}
                        {q.self === k && <span className="ml-2 text-sm text-primary">you said</span>}
                      </span>
                      <span className="text-muted-foreground">{k === "a" ? q.a : q.b} guessed</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>}
            {(data.guessers ?? []).length > 0 && (
              <div className="mt-10">
                <h2 className="text-2xl">Who guessed</h2>
                <ul className="mt-4">
                  {(data.guessers ?? []).map((g, i) => (
                    <li key={i} className="flex justify-between border-b border-border py-3">
                      <span>{g.name}</span>
                      <span className="text-muted-foreground">{g.score}/5</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      <AppTabs />
    </main>
  );
}

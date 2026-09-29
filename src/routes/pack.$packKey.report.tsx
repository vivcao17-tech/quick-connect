import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getOwnPackReport } from "@/lib/pack-report.functions";
import { isReportPack, type ReportPack } from "@/lib/pack-report";
import { PACK_LABEL } from "@/lib/packs";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/pack/$packKey/report")({
  component: PackReportPage,
  head: ({ params }) => ({
    meta: [
      { title: `${isReportPack(params.packKey) ? PACK_LABEL[params.packKey] : "Pack"} report — NoSure` },
      { name: "description", content: "See where your own answers sit within this pack." },
      { property: "og:title", content: "Your pack report — NoSure" },
      { property: "og:description", content: "A private read of your own answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Report = Awaited<ReturnType<typeof getOwnPackReport>>;

function PackReportPage() {
  const { packKey } = Route.useParams();
  const pack: ReportPack | null = isReportPack(packKey) ? packKey : null;
  const viewer = useViewer();
  const load = useServerFn(getOwnPackReport);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pack || !viewer.ready) return;
    let live = true;
    setReport(null);
    setError(false);
    void load({ data: { pack, guestToken: viewer.guestToken, ...(viewer.profileId ? { profileId: viewer.profileId } : {}) } })
      .then((data) => { if (live) setReport(data); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [load, pack, viewer.guestToken, viewer.profileId, viewer.ready]);

  if (!pack) return <main className="paper mx-auto min-h-screen max-w-xl px-6 py-12"><h1>That pack isn't available.</h1><Link to="/remote">Back to questions</Link></main>;
  const visible = report?.axes.filter((axis) => axis.count >= 2) ?? [];
  const hidden = report?.axes.filter((axis) => axis.count < 2) ?? [];
  return (
    <main className="paper min-h-screen bg-background pb-28">
      <section className="mx-auto max-w-xl px-6 py-12">
        <Link to="/remote" className="text-sm text-muted-foreground">← Packs</Link>
        <p className="mt-10 text-sm uppercase text-muted-foreground">{PACK_LABEL[pack]}</p>
        <h1 className="mt-2 text-4xl leading-tight">Your read on this pack</h1>
        {!report && !error && <p className="mt-8 text-muted-foreground">Loading your answers…</p>}
        {error && <p className="mt-8 text-muted-foreground">Your answers couldn't load. Please try again.</p>}
        {report && report.answered < 4 && (
          <div className="mt-10">
            <p className="text-lg">Answer {4 - report.answered} more to unlock.</p>
            <Link to="/remote" search={{ pack }} className="btn-ink mt-5 inline-block">Answer questions</Link>
          </div>
        )}
        {report && report.answered >= 4 && (
          <>
            <p className="mt-5 text-sm text-muted-foreground">Based on your own answers in {PACK_LABEL[pack]}.</p>
            <div className="mt-9 space-y-10">
              {visible.map((axis) => (
                <div key={axis.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-xl">{axis.name}</h2>
                    <span className="shrink-0 text-sm text-muted-foreground">{axis.count} answers</span>
                  </div>
                  <div role="img" aria-label={`${axis.name}: ${Math.round(axis.position)} percent toward ${axis.right}`} className="relative mt-5 h-3 rounded-full bg-secondary">
                    <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-sm" style={{ left: `${Math.min(97, Math.max(3, axis.position))}%` }} />
                  </div>
                  <div className="mt-3 flex justify-between gap-4 text-sm text-foreground">
                    <span className="max-w-[48%]">{axis.left}</span>
                    <span className="max-w-[48%] text-right">{axis.right}</span>
                  </div>
                </div>
              ))}
            </div>
            {visible.length === 0 && <p className="mt-8 text-muted-foreground">Answer more questions in this pack to see an axis.</p>}
            {hidden.length > 0 && <div className="mt-12 border-t border-border pt-6 space-y-5">
              {hidden.map((axis) => (
                <div key={axis.key} className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Answer {2 - axis.count} more about {axis.name} to see this</p>
                  <Link to="/remote" search={{ pack }} className="text-sm text-primary underline">Answer questions →</Link>
                </div>
              ))}
            </div>}
            <div className="mt-14 border-t border-border pt-8">
              <p className="text-lg">See whether your friends read you the same way</p>
              <Link to="/know" className="btn-ink mt-4 inline-block">Create or share your card</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
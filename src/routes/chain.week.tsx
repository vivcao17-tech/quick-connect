import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getChainSettlement } from "@/lib/chain.functions";
import { track } from "@/lib/track";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/chain/week")({
  component: ChainWeekPage,
  head: () => ({
    meta: [
      { title: "How the week landed — NoSure" },
      {
        name: "description",
        content:
          "What people guessed about you this week, and the gap between how people see themselves and how they read everyone else.",
      },
      { property: "og:title", content: "How the week landed — NoSure" },
      {
        property: "og:description",
        content: "What people guessed about you, and this week's gap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "How the week landed — NoSure" },
      {
        name: "twitter:description",
        content: "What people guessed about you, and this week's gap.",
      },
    ],
  }),
});

type Settlement = Awaited<ReturnType<typeof getChainSettlement>>;

function ChainWeekPage() {
  const viewer = useViewer();
  const load = useServerFn(getChainSettlement);
  const [state, setState] = useState<Settlement | null>(null);

  useEffect(() => {
    if (!viewer.ready) return;
    void load({
      data: {
        ...(viewer.guestToken ? { guestToken: viewer.guestToken } : {}),
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then(setState)
      .catch(() => undefined);
  }, [viewer.ready, viewer.guestToken, viewer.profileId, load]);

  const gap = state?.gap ?? null;

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">The week</p>

        {state?.week && (
          <h1 className="mt-6 text-3xl leading-snug">
            {state.week.question.text.replace(/\{name\}/g, "someone")}
          </h1>
        )}

        {state && state.lines.length > 0 && (
          <div className="mt-12">
            <p className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
              What happened
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {state.lines.map((line, i) => (
                <div key={i}>
                  <p className="text-lg">{line.text}</p>
                  {line.because && (
                    <p className="text-base text-muted-foreground">“{line.because}”</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {gap && (
          <div className="card-soft mt-12 px-6 py-6">
            <p className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
              This week's gap
            </p>
            <p className="mt-4 text-xl">{gap.selfLine}</p>
            <p className="text-xl">{gap.guessLine}</p>
            <p className="mt-4 text-lg text-muted-foreground">{gap.observation}</p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${gap.selfLine} ${gap.guessLine} ${gap.observation}`,
                );
                track("chain_settlement_shared", {});
              }}
              className="mt-6 text-sm text-primary underline underline-offset-4"
            >
              Copy this
            </button>
          </div>
        )}

        {!gap && state?.friendSplit && <p className="mt-12 text-xl">{state.friendSplit}</p>}

        <Link to="/chain" className="btn-ink mt-14 w-full py-5 text-center text-lg">
          This week's read
        </Link>
        <Link
          to="/"
          className="mt-8 self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          Back
        </Link>
      </section>
    </main>
  );
}

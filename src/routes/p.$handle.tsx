import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { track } from "@/lib/track";

import { getPublicProfile } from "@/lib/profile.functions";
import {
  byRecency,
  isMismatch,
  wallText,
  labelOf,
  PUBLIC_PROMPT_PREVIEW_COUNT,
  share,
  topOption,
} from "@/lib/profile-shared";

export const Route = createFileRoute("/p/$handle")({
  loader: async ({ params }) => {
    const profile = await getPublicProfile({ data: { handle: params.handle } });
    if (!profile) throw notFound();
    return profile;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.displayName ?? "someone";
    const first = name.trim().split(/\s+/)[0] || "Their";
    const title = `${first}'s wall`;
    const description = `See how people guess ${first} — then guess them yourself.`;
    const url = `https://nosure.app/p/${loaderData?.handle ?? ""}`;
    const image = `https://nosure.app/api/public/og/wall/${loaderData?.handle ?? "missing"}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: () => (
    <Shell>
      <p className="text-lg text-muted-foreground">That link isn't open.</p>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <p className="text-lg text-muted-foreground">That link isn't open.</p>
    </Shell>
  ),
  component: PublicProfile,
});

function PublicProfile() {
  const profile = Route.useLoaderData();

  useEffect(() => {
    track("profile_view", { handle: profile.handle });
  }, [profile.handle]);

  const [showAllPrompts, setShowAllPrompts] = useState(false);

  // The server already decided what publishes: the owner's picks, or the four
  // most recent reads. Most recent first here too.
  const shown = [...profile.impressions].sort(byRecency);
  const promptsShown = showAllPrompts
    ? profile.prompts
    : profile.prompts.slice(0, PUBLIC_PROMPT_PREVIEW_COUNT);

  return (
    <Shell>
      <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
        no<span className="text-primary">/</span>sure
      </p>
      <h1 className="mt-8 text-5xl leading-[1.05]">
        How {profile.displayName}'s friends read them
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">From the last 90 days.</p>

      <div className="mt-12 flex flex-col gap-10">
        {shown.map((imp) => {
          const top = topOption(imp);
          const gap = isMismatch(imp);
          return (
            <div
              key={imp.questionId}
              className={gap ? "card-soft border-primary px-6 py-6" : "card-soft px-6 py-6"}
            >
              <p className="text-xl leading-snug">{wallText(imp, profile.displayName)}</p>
              <div className="mt-5 flex flex-col gap-3">
                {imp.options.map((option) => {
                  const { percent, label } = share(imp.counts[option.key] ?? 0, imp.total);
                  return (
                    <div key={option.key}>
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-base">{option.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {percent}% · {label}
                        </p>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {imp.selfKey && top && (
                <div className="mt-6">
                  <p
                    className={gap ? "text-3xl leading-snug text-primary" : "text-2xl leading-snug"}
                  >
                    They read {profile.displayName} as {labelOf(imp, top.key)}.
                  </p>
                  <p className="mt-2 text-2xl leading-snug">
                    {profile.displayName} said {labelOf(imp, imp.selfKey)}.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>


      {profile.prompts.length > 0 && (
        <div className="mt-14 flex flex-col gap-5">
          <h2 className="text-3xl">In their own words</h2>
          {promptsShown.map((prompt) => (
            <div key={prompt.key} className="card-soft px-6 py-5">
              <p className="text-base text-muted-foreground">{prompt.key.replace(/_/g, " ")}</p>
              <p className="mt-2 text-xl leading-snug">{prompt.answer}</p>
            </div>
          ))}
          {!showAllPrompts && profile.prompts.length > PUBLIC_PROMPT_PREVIEW_COUNT && (
            <button
              onClick={() => setShowAllPrompts(true)}
              className="self-start text-sm text-muted-foreground underline underline-offset-4"
            >
              More about me
            </button>
          )}
        </div>
      )}

      <div className="card-soft mt-16 border-primary px-6 py-8">
        <p className="text-3xl leading-snug">Find out how people read you.</p>
        <Link
          to="/start"
          onClick={() => track("profile_cta_tap", { handle: profile.handle })}
          className="btn-ink mt-6 inline-block"
        >
          Start
        </Link>
        <p className="mt-3 text-sm text-muted-foreground">30 seconds, no account</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-16">
        {children}
      </section>
    </main>
  );
}

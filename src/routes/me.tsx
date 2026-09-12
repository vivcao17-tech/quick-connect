import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import {
  getMyProfile,
  markImpressionsSeen,
  saveProfilePrompt,
  setImpressionVisibility,
  setProfileHandle,
} from "@/lib/profile.functions";
import {
  isMismatch,
  labelOf,
  mismatchRate,
  PROFILE_PROMPTS,
  share,
  topOption,
} from "@/lib/profile-shared";
import type { ProfileImpression } from "@/lib/profile-shared";

export const Route = createFileRoute("/me")({
  component: MyProfile,
  head: () => ({
    meta: [
      { title: "Their read on you — NoSure" },
      {
        name: "description",
        content: "How the people you've answered with read you, next to how you read yourself.",
      },
      { property: "og:title", content: "Their read on you — NoSure" },
      {
        property: "og:description",
        content: "How people read you, next to how you read yourself.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Their read on you — NoSure" },
      {
        name: "twitter:description",
        content: "How people read you, next to how you read yourself.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Loaded = Awaited<ReturnType<typeof getMyProfile>>;

function MyProfile() {
  const load = useServerFn(getMyProfile);
  const seen = useServerFn(markImpressionsSeen);
  const toggle = useServerFn(setImpressionVisibility);
  const savePrompt = useServerFn(saveProfilePrompt);
  const saveHandle = useServerFn(setProfileHandle);

  const [profile, setProfile] = useState<Loaded | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [handle, setHandle] = useState("");
  const [handleNote, setHandleNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await load();
      setProfile(result);
      setHandle(result.handle ?? "");
      setDrafts(Object.fromEntries(result.prompts.map((p) => [p.key, p.answer])));
    } catch {
      setSignedOut(true);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Opening the page is what clears "someone read you".
  useEffect(() => {
    if (!profile || profile.newSince === 0) return;
    void seen().catch(() => undefined);
  }, [profile, seen]);

  if (signedOut) {
    return (
      <Shell>
        <h1 className="text-4xl leading-tight">Their read on you lives with your account.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Sign in and it's here, with everything people have read about you.
        </p>
        <Link to="/auth" search={{ redirect: "/me" }} className="btn-ink mt-8 self-start">
          Sign in
        </Link>
      </Shell>
    );
  }

  if (!profile) {
    return (
      <Shell>
        <p className="text-lg text-muted-foreground">One moment…</p>
      </Shell>
    );
  }

  const shareUrl =
    profile.handle && typeof window !== "undefined"
      ? `${window.location.origin}/p/${profile.handle}`
      : "";

  // Where people read you most differently from how you read yourself, first.
  const sorted = [...profile.impressions].sort((a, b) => {
    const rate = mismatchRate(b) - mismatchRate(a);
    if (rate !== 0) return rate;
    return b.total - a.total;
  });
  const shown = showAll ? sorted : sorted.slice(0, 5);

  return (
    <Shell>
      <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">Their read on you</p>
      <h1 className="mt-6 text-5xl leading-[1.05]">{profile.displayName}</h1>
      <p className="mt-3 text-sm text-muted-foreground">From the last 90 days.</p>

      {shareUrl && (
        <div className="card-soft mt-8 px-6 py-5">
          <p className="text-base break-all">{shareUrl}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl);
                setCopied(true);
              }}
              className="btn-quiet"
            >
              {copied ? "Copied" : "Copy your link"}
            </button>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm outline-none focus:border-primary"
              aria-label="Your link name"
            />
            <button
              onClick={() => {
                void saveHandle({ data: { handle } }).then((result) => {
                  setHandleNote(result.saved ? "Saved" : result.reason);
                  if (result.saved) void refresh();
                });
              }}
              className="text-sm underline underline-offset-4"
            >
              Change
            </button>
            {handleNote && <span className="text-sm text-muted-foreground">{handleNote}</span>}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card-soft mt-10 px-6 py-8">
          <p className="text-2xl leading-snug">Send a set to a few people and this fills up.</p>
          <p className="mt-3 text-lg text-muted-foreground">
            Three questions each. Their read on you lands here.
          </p>
          <Link to="/start" className="btn-ink mt-8 inline-block">
            Send a set
          </Link>
        </div>
      ) : (
        <div className="mt-12 flex flex-col gap-10">
          {shown.map((imp) => (
            <ImpressionCard
              key={imp.questionId}
              imp={imp}
              onToggle={() => {
                void toggle({ data: { questionId: imp.questionId, hidden: !imp.hidden } }).then(
                  () => void refresh(),
                );
              }}
            />
          ))}
          {!showAll && sorted.length > 5 && (
            <button
              onClick={() => setShowAll(true)}
              className="self-start text-sm text-muted-foreground underline underline-offset-4"
            >
              See all {sorted.length}
            </button>
          )}
        </div>
      )}

      <h2 className="mt-16 text-3xl">In your own words</h2>
      <div className="mt-6 flex flex-col gap-5">
        {PROFILE_PROMPTS.map((prompt) => {
          const saved = profile.prompts.find((p) => p.key === prompt.key);
          return (
            <div key={prompt.key} className="card-soft px-6 py-5">
              <p className="text-lg">{prompt.label}</p>
              <input
                value={drafts[prompt.key] ?? ""}
                maxLength={200}
                onChange={(event) =>
                  setDrafts((all) => ({ ...all, [prompt.key]: event.target.value }))
                }
                onBlur={() => {
                  void savePrompt({
                    data: {
                      promptKey: prompt.key,
                      answer: drafts[prompt.key] ?? "",
                      visible: saved?.visible ?? true,
                    },
                  }).then(() => void refresh());
                }}
                placeholder="Short answer"
                className="mt-3 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-primary"
              />
              {saved && (
                <button
                  onClick={() => {
                    void savePrompt({
                      data: {
                        promptKey: prompt.key,
                        answer: saved.answer,
                        visible: !saved.visible,
                      },
                    }).then(() => void refresh());
                  }}
                  className="mt-3 text-sm text-muted-foreground underline underline-offset-4"
                >
                  {saved.visible ? "Showing on your link" : "Hidden from your link"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Link
        to="/"
        className="mt-14 self-start text-sm text-muted-foreground underline underline-offset-4"
      >
        Home
      </Link>
    </Shell>
  );
}

function ImpressionCard({ imp, onToggle }: { imp: ProfileImpression; onToggle: () => void }) {
  const top = topOption(imp);
  const gap = isMismatch(imp);
  return (
    <div className={gap ? "card-soft border-primary px-6 py-6" : "card-soft px-6 py-6"}>
      <p className="text-xl leading-snug">{imp.text}</p>

      <div className="mt-5 flex flex-col gap-3">
        {imp.options.map((option) => {
          const count = imp.counts[option.key] ?? 0;
          const { percent, label } = share(count, imp.total);
          return (
            <div key={option.key}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-base">{option.label}</p>
                <p className="text-sm text-muted-foreground">
                  {percent}% · {label}
                </p>
              </div>
              <div className="mt-1 h-2 rounded-full bg-secondary">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {imp.selfKey && top && (
        <div className="mt-6">
          <p className={gap ? "text-3xl leading-snug text-primary" : "text-2xl leading-snug"}>
            They read you as {labelOf(imp, top.key)}.
          </p>
          <p className="mt-2 text-2xl leading-snug">You said {labelOf(imp, imp.selfKey)}.</p>
        </div>
      )}

      {/* Sends this exact question as the third one, to whoever they name. */}
      <Link
        to="/remote"
        search={{ impression: imp.questionId }}
        className="mt-6 inline-block rounded-full border-2 border-primary px-5 py-2 text-base text-primary"
      >
        Ask more people
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button onClick={onToggle} className="text-sm underline underline-offset-4">
          {imp.hidden ? "Hidden — show it" : "Showing — hide it"}
        </button>
      </div>
    </div>
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

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { readLocalSession } from "@/lib/auth-session";
import { AppTabs } from "@/components/AppTabs";
import { ImpressionResults } from "@/components/ImpressionResults";
import { getMyImpressions } from "@/lib/know.functions";
import { logClientCardEvent } from "@/lib/card-events.functions";
import { getWeeklyImpression } from "@/lib/weekly.functions";
import { readLocalViewer } from "@/lib/viewer";
import {
  getMyProfile,
  getMyProfileDetails,
  markImpressionsSeen,
  saveProfilePrompt,
  setImpressionVisibility,
  setProfileHandle,
} from "@/lib/profile.functions";
import {
  byRecency,
  isMismatch,
  labelOf,
  onWall,
  PROFILE_PROMPTS,
  share,
  topOption,
  wallText,
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
  const loadDetails = useServerFn(getMyProfileDetails);
  const seen = useServerFn(markImpressionsSeen);
  const toggle = useServerFn(setImpressionVisibility);
  const savePrompt = useServerFn(saveProfilePrompt);
  const saveHandle = useServerFn(setProfileHandle);

  const [profile, setProfile] = useState<Loaded | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [ready, setReady] = useState(false);
  const [handle, setHandle] = useState("");
  const [handleNote, setHandleNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  // Which reads were new when this visit started. Kept for the whole visit so
  // the "New" marks don't vanish the moment the page marks them as seen.
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set<string>());
  const [email, setEmail] = useState("");
  // Assumed installed until the browser says otherwise, so the instructions
  // never flash for people who already added the app.
  const [notInstalled, setNotInstalled] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const started = useRef(false);
  const capturedNew = useRef(false);
  const navigate = useNavigate();

  const fillDetails = useCallback(async () => {
    try {
      const details = await loadDetails();
      setProfile((current) => (current ? { ...current, ...details } : current));
      setDrafts(Object.fromEntries(details.prompts.map((prompt) => [prompt.key, prompt.answer])));
      setDetailsLoaded(true);
    } catch {
      // Impression cards remain usable if secondary profile details fail.
    }
  }, [loadDetails]);

  const refresh = useCallback(async () => {
    try {
      // Without a live token the call is rejected server-side, so ask first.
      const { accessToken, email: sessionEmail } = await readLocalSession();
      if (!accessToken) {
        setSignedOut(true);
        setReady(true);
        return;
      }
      setEmail(sessionEmail ?? "");
      const result = await load();
      if (!capturedNew.current) {
        capturedNew.current = true;
        setNewIds(
          new Set(
            result.impressions
              .filter((imp) => (imp.newCount ?? 0) > 0)
              .map((imp) => imp.questionId),
          ),
        );
      }
      setProfile(result);
      setHandle(result.handle ?? "");
      void fillDetails();
    } catch {
      setSignedOut(true);
    } finally {
      setReady(true);
    }
  }, [fillDetails, load]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refresh();
  }, [refresh]);

  // Opening the page is what clears "someone read you".
  useEffect(() => {
    if (!profile || profile.newSince === 0) return;
    void seen().catch(() => undefined);
  }, [profile, seen]);

  // Installed apps report display-mode: standalone (iOS home-screen web apps
  // set navigator.standalone instead).
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const iosStandalone = "standalone" in window.navigator && Boolean(window.navigator.standalone);
    setNotInstalled(!media.matches && !iosStandalone);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }, [navigate]);

  if (signedOut) {
    return (
      <Shell>
        <EntryCards />
      </Shell>
    );
  }

  if (!ready || !profile) {
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

  // Anything new first, then the most recent reads. Everything stays visible
  // to you here, whether or not it's on your public wall.
  const sorted = [...profile.impressions].sort((a, b) => {
    const fresh = Number(newIds.has(b.questionId)) - Number(newIds.has(a.questionId));
    return fresh !== 0 ? fresh : byRecency(a, b);
  });
  const curated = Boolean(profile.curated);
  const impressionsOnWall = sorted.filter((imp) => onWall(imp, curated)).length;
  const impressionsHidden = sorted.length - impressionsOnWall;
  const savedPrompts = profile.prompts.filter((prompt) => prompt.answer.trim().length > 0);
  const promptsOnWall = savedPrompts.filter((prompt) => prompt.visible).length;
  const promptsHidden = savedPrompts.length - promptsOnWall;

  return (
    <Shell>
      <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">no<span className="text-primary">/</span>sure</p>
      <h1 className="mt-6 text-5xl leading-[1.05]">You</h1>

      <EntryCards />


      {false && shareUrl && (
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

      {(profile.undisplayedNew ?? 0) > 0 && (
        <a
          href="#new-read"
          className="hidden mt-6 self-start text-base text-primary underline underline-offset-4"
        >
          {profile.undisplayedNew} new{" "}
          {profile.undisplayedNew === 1 ? "read isn't" : "reads aren't"} on your wall yet — see it
          and choose
        </a>
      )}

      {false && (sorted.length === 0 ? (
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
        <div id="wall-edit" className="mt-12 flex scroll-mt-10 flex-col gap-10">
          <p className="text-base text-muted-foreground">
            {impressionsOnWall} on your wall, {impressionsHidden} kept private · every read stays
            visible to you here
          </p>
          {sorted.map((imp, index) => (
            <ImpressionCard
              key={imp.questionId}
              imp={imp}
              curated={curated}
              isNew={newIds.has(imp.questionId)}
              anchor={index === 0 && newIds.has(imp.questionId)}
              onToggle={() => {
                void toggle({
                  data: { questionId: imp.questionId, hidden: onWall(imp, curated) },
                }).then(() => void refresh());
              }}
            />
          ))}
        </div>
      ))}

      <div className="hidden">
      <h2 className="mt-16 text-3xl">In your own words</h2>
      {detailsLoaded ? (
        <p className="mt-3 text-base text-muted-foreground">
          {promptsOnWall} on your wall, {promptsHidden} hidden
        </p>
      ) : (
        <p className="mt-3 text-base text-muted-foreground">Loading your answers…</p>
      )}
      <div
        className={`mt-6 flex flex-col gap-5 transition-opacity ${detailsLoaded ? "opacity-100" : "pointer-events-none opacity-45"}`}
      >
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
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {saved?.visible ? "On your wall" : "Hidden"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={saved?.visible ?? false}
                  aria-label={`${saved?.visible ? "Hide" : "Show"} ${prompt.label} on your wall`}
                  disabled={!saved}
                  onClick={() => {
                    if (!saved) return;
                    void savePrompt({
                      data: {
                        promptKey: prompt.key,
                        answer: saved.answer,
                        visible: !saved.visible,
                      },
                    }).then(() => void refresh());
                  }}
                  className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    saved?.visible ? "border-primary bg-primary" : "border-border bg-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-background transition-transform ${
                      saved?.visible ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
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

      </div>
      <footer className="mt-16 flex flex-col gap-4 border-t border-border pt-8 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/terms" className="underline underline-offset-4">
            Terms
          </Link>
          <Link to="/privacy" className="underline underline-offset-4">
            Privacy
          </Link>
          <button
            type="button"
            aria-expanded={showContact}
            onClick={() => setShowContact((v) => !v)}
            className="underline underline-offset-4"
          >
            Contact
          </button>
        </div>
        {showContact && (
          <p className="leading-relaxed">
            Email{" "}
            <a href="mailto:hello@nosure.app" className="underline underline-offset-4">
              hello@nosure.app
            </a>
            , or follow{" "}
            <a
              href="https://instagram.com/nosure.app"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              nosure.app
            </a>{" "}
            on Instagram to DM us any questions.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="underline underline-offset-4"
          >
            Sign out
          </button>
          {email && <p className="mt-2">{email}</p>}
        </div>
        {notInstalled && (
          <p>
            On iPhone: tap the Share button, then “Add to Home Screen” to keep NoSure on your
            home screen.
          </p>
        )}
      </footer>
    </Shell>
  );
}

/** The impression card is the one visible starting point on You. */
function EntryCards() {
  const load = useServerFn(getMyImpressions);
  const logEvent = useServerFn(logClientCardEvent);
  const loadWeekly = useServerFn(getWeeklyImpression);
  const [card, setCard] = useState<Awaited<ReturnType<typeof getMyImpressions>> | undefined>(undefined);
  const [weekly, setWeekly] = useState<Awaited<ReturnType<typeof getWeeklyImpression>> | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    void readLocalViewer()
      .then(async (v) => {
        const [r, w] = await Promise.allSettled([
          load({ data: { ...v, markSeen: true } }), loadWeekly({ data: v }),
        ]);
        setCard(r.status === "fulfilled" ? r.value : null);
        if (r.status === "fulfilled" && r.value) {
          const key = `nosure.card-link-shown.${r.value.token}`;
          if (!window.localStorage.getItem(key)) {
            window.localStorage.setItem(key, "1");
            void logEvent({ data: { event: "card_link_shown", token: r.value.token, ...v } }).catch(() => undefined);
          }
          if (r.value.guessCount) void logEvent({ data: { event: "results_viewed", token: r.value.token, ...v } }).catch(() => undefined);
        }
        setWeekly(w.status === "fulfilled" ? w.value : null);
        if (r.status === "fulfilled") window.dispatchEvent(new Event("nosure:impressions-seen"));
      })
      .catch(() => setCard(undefined));
  }, [load, loadWeekly, logEvent]);

  const guessUrl = card ? `https://nosure.app/guess/${card.token}` : "";

  return (
    <div className="mt-8">
      <div className="card-soft border-primary px-5 py-5">
        <p className="text-xl leading-snug">
          {card && card.guessCount > 0
            ? `${card.guessCount} ${card.guessCount === 1 ? "person has" : "people have"} read you`
            : "See how your friends read you"}
        </p>
        {card === undefined ? (
          <span aria-hidden="true" className="mt-3 block h-10 animate-pulse rounded bg-muted" />
        ) : card === null ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Answer five questions about yourself. Send the link. See who reads you right.
            </p>
            <div className="mt-4">
              <Link to="/know" className="btn-ink inline-block">
                Start
              </Link>
            </div>
            <Link
              to="/example/impressions"
              className="mt-6 block w-fit border-t border-border pt-4 text-lg font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              See an example →
            </Link>
          </>
        ) : (
          <>
            {card.guessCount === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No one has guessed yet. Send it to 3 people who know you.</p>
            ) : <ImpressionResults data={card} />}
            <p className="mt-5 break-all text-sm">{`nosure.app/guess/${card.token}`}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                   void readLocalViewer().then((viewer) => logEvent({ data: { event: "share_link_copied", token: card.token, ...viewer, meta: { method: "copy" } } })).catch(() => undefined);
                  void navigator.clipboard.writeText(guessUrl).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              {canShare && <button type="button" className="btn-quiet" onClick={() => { void readLocalViewer().then((viewer) => logEvent({ data: { event: "share_link_copied", token: card.token, ...viewer, meta: { method: "share" } } })).catch(() => undefined); void navigator.share({ title: "How well do you know me?", url: guessUrl }).catch(() => undefined); }}>Share</button>}
              <span className="text-sm text-muted-foreground">
                {card.guessCount} {card.guessCount === 1 ? "person has" : "people have"} guessed
              </span>
            </div>
            <Link
              to="/me/impressions"
              className="mt-4 inline-block text-sm underline underline-offset-4"
            >
              See who's guessed
            </Link>
          </>
        )}
      </div>
      {card !== null && (
        <Link
          to="/example/impressions"
          className="mt-6 block w-fit text-lg font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          See an example →
        </Link>
      )}

      {weekly && weekly.questions[0]?.text?.trim() && (
        <div className="mt-8 border-t border-border pt-6">
          <h2 className="text-xl">This week's question</h2>
          <p className="mt-2 text-sm text-muted-foreground">{weekly.questions[0]?.text}</p>
          {weekly.token ? (
            <Link to="/weekly-impression" className="mt-4 inline-block text-sm underline underline-offset-4">Send this week's link</Link>
          ) : (
            <Link to="/weekly-impression" className="btn-quiet mt-4 inline-block">Answer and send</Link>
          )}
        </div>
      )}

    </div>
  );
}

function ImpressionCard({
  imp,
  curated,
  isNew,
  anchor,
  onToggle,
}: {
  imp: ProfileImpression;
  curated: boolean;
  isNew?: boolean;
  anchor?: boolean;
  onToggle: () => void;
}) {
  const top = topOption(imp);
  const gap = isMismatch(imp);
  const shown = onWall(imp, curated);
  return (
    <div
      id={anchor ? "new-read" : undefined}
      className={`scroll-mt-10 ${gap ? "card-soft border-primary px-6 py-6" : "card-soft px-6 py-6"}`}
    >
      {isNew && (
        <p className="mb-3 text-sm tracking-[0.14em] text-primary uppercase">
          New{shown ? "" : " · not on your wall"}
        </p>
      )}
      <p className="text-xl leading-snug">{wallText(imp, "you")}</p>

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
          {!gap && (
            <p className="mt-3 text-sm tracking-[0.14em] text-muted-foreground uppercase">
              They got this one right
            </p>
          )}
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

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
        <span className="text-sm font-medium">{shown ? "On your wall" : "Kept private"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label={`${shown ? "Hide" : "Show"} this question on your wall`}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
            shown ? "border-primary bg-primary" : "border-border bg-secondary"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-background transition-transform ${
              shown ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper min-h-screen bg-background pb-28">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-16">
        {children}
      </section>
      <AppTabs />
    </main>
  );
}

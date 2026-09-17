import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { ChainGuess } from "@/components/ChainGuess";
import { selfStem } from "@/lib/chain-shared";
import type { ChainOption } from "@/lib/chain-shared";
import { addChainGuess, answerChainSelf, getChainWeek } from "@/lib/chain.functions";
import { track } from "@/lib/track";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/chain")({
  component: ChainPage,
  head: () => ({
    meta: [
      { title: "This week's read — NoSure" },
      {
        name: "description",
        content: "One question a week. Guess a friend, they guess you, you both find out at once.",
      },
      { property: "og:title", content: "This week's read — NoSure" },
      { property: "og:description", content: "One question. Guess a friend. 30 seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "This week's read — NoSure" },
      { name: "twitter:description", content: "One question. Guess a friend. 30 seconds." },
    ],
  }),
});

type Week = Awaited<ReturnType<typeof getChainWeek>>;

function ChainPage() {
  const viewer = useViewer();
  const loadWeek = useServerFn(getChainWeek);
  const saveSelf = useServerFn(answerChainSelf);
  const saveGuess = useServerFn(addChainGuess);

  const [state, setState] = useState<Week | null>(null);
  const [myName, setMyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMyName(window.localStorage.getItem("beside.name") ?? "");
  }, []);

  const refresh = useCallback(() => {
    if (!viewer.ready) return;
    void loadWeek({
      data: {
        ...(viewer.guestToken ? { guestToken: viewer.guestToken } : {}),
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then(setState)
      .catch(() => undefined);
  }, [viewer.ready, viewer.guestToken, viewer.profileId, loadWeek]);

  useEffect(refresh, [refresh]);

  if (!state) {
    return <main className="paper min-h-screen bg-background" />;
  }

  const week = state.week;

  if (!week || !week.open) {
    return (
      <main className="paper min-h-screen bg-background">
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-20">
          <h1 className="text-4xl leading-tight">This week's read opens Thursday.</h1>
          {week && (
            <Link to="/chain/week" className="btn-ink w-full py-5 text-center text-lg">
              See how last week landed
            </Link>
          )}
          <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
            Back
          </Link>
        </section>
      </main>
    );
  }

  const question = week.question;

  async function pickSelf(option: ChainOption) {
    if (!viewer.guestToken || busy || !week) return;
    setBusy(true);
    try {
      await saveSelf({
        data: {
          weekId: week.id,
          guestToken: viewer.guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          ...(myName.trim() ? { displayName: myName.trim() } : {}),
          option,
        },
      });
      track("chain_self_answered", { week: week.id });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function guess(value: { subjectName: string; option: ChainOption; because: string }) {
    if (!viewer.guestToken || busy || !week) return;
    setBusy(true);
    try {
      const result = await saveGuess({
        data: {
          weekId: week.id,
          guestToken: viewer.guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          guesserName: myName.trim() || "A friend",
          subjectName: value.subjectName,
          guessedOption: value.option,
          ...(value.because.trim() ? { because: value.because.trim() } : {}),
        },
      });
      track("chain_guess_sent", { week: week.id, with_reason: Boolean(value.because.trim()) });
      setLink({ url: `${window.location.origin}/c/${result.token}`, name: value.subjectName });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">This week's read</p>

        {link ? (
          <div className="mt-8">
            <h1 className="text-4xl leading-tight">Send this to {link.name}.</h1>
            <p className="mt-4 text-base text-muted-foreground">
              They see that you guessed them — not what you picked.
            </p>
            <div className="card-soft mt-6 px-6 py-5 text-base break-all">{link.url}</div>
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    `${link.name} — I guessed you on this week's question. 30 seconds, no signup. ${link.url}`,
                  )
                  .then(() => setCopied(true));
                track("chain_link_copied", {});
              }}
              className="btn-ink mt-5 w-full py-5 text-lg"
            >
              {copied ? "Copied" : "Copy message + link"}
            </button>
            <Link
              to="/"
              className="mt-10 block text-sm text-muted-foreground underline underline-offset-4"
            >
              Done
            </Link>
          </div>
        ) : !state.mine ? (
          <>
            <h1 className="mt-6 text-3xl leading-snug">{selfStem(question)}</h1>
            <div className="mt-8 flex flex-col gap-3">
              <button
                disabled={busy}
                onClick={() => void pickSelf("a")}
                className="card-soft px-6 py-5 text-left text-xl hover:border-primary"
              >
                {question.optionA}
              </button>
              <button
                disabled={busy}
                onClick={() => void pickSelf("b")}
                className="card-soft px-6 py-5 text-left text-xl hover:border-primary"
              >
                {question.optionB}
              </button>
            </div>
            {!myName && (
              <input
                value={myName}
                onChange={(event) => {
                  setMyName(event.target.value);
                  window.localStorage.setItem("beside.name", event.target.value);
                }}
                placeholder="Your name"
                maxLength={40}
                className="mt-8 w-full rounded-full border border-border bg-card px-6 py-4 text-lg outline-none focus:border-primary"
              />
            )}
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl leading-snug">Now guess a friend.</h1>
            {/* Your name travels with the link — "Amy guessed you" needs a name. */}
            {!myName.trim() ? (
              <input
                value={myName}
                onChange={(event) => {
                  setMyName(event.target.value);
                  window.localStorage.setItem("beside.name", event.target.value);
                }}
                placeholder="Your name"
                maxLength={40}
                autoFocus
                className="mt-8 w-full rounded-full border border-border bg-card px-6 py-4 text-lg outline-none focus:border-primary"
              />
            ) : (
              <ChainGuess question={question} onDone={(value) => void guess(value)} busy={busy} />
            )}
          </>
        )}

        {state.reads.length > 0 && !link && (
          <div className="mt-14">
            <p className="text-sm tracking-[0.18em] text-muted-foreground uppercase">
              Read by others
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {state.reads.map((line, i) => (
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

        <Link
          to="/"
          className="mt-14 self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          Back
        </Link>
      </section>
    </main>
  );
}

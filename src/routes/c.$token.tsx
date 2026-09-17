import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { ChainGuess } from "@/components/ChainGuess";
import { selfStem } from "@/lib/chain-shared";
import type { ChainOption } from "@/lib/chain-shared";
import { addChainGuess, answerChainSelf, openChainLink } from "@/lib/chain.functions";
import { track } from "@/lib/track";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/c/$token")({
  component: ChainLinkPage,
  head: () => ({
    meta: [
      { title: "Someone guessed you — NoSure" },
      {
        name: "description",
        content: "One question. Someone made a guess about you. Guess them back and you both find out at once.",
      },
      { property: "og:title", content: "Someone guessed you" },
      { property: "og:description", content: "One question. 30 seconds. No signup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Someone guessed you" },
      { name: "twitter:description", content: "One question. 30 seconds. No signup." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type LinkState = Awaited<ReturnType<typeof openChainLink>>;

function ChainLinkPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const viewer = useViewer();
  const open = useServerFn(openChainLink);
  const saveSelf = useServerFn(answerChainSelf);
  const saveGuess = useServerFn(addChainGuess);

  const [state, setState] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [passLink, setPassLink] = useState<{ url: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void open({
      data: {
        token,
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then(setState)
      .catch(() => undefined);
  }, [viewer.ready, viewer.guestToken, viewer.profileId, open, token]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (state) track("chain_link_opened", { step: state.step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.step]);

  if (!state) return <main className="paper min-h-screen bg-background" />;

  const question = state.week.question;
  const step = skipped && state.step === "pass" ? "reveal" : state.step;

  async function pickSelf(option: ChainOption) {
    if (!viewer.guestToken || busy || !state) return;
    setBusy(true);
    try {
      await saveSelf({
        data: {
          weekId: state.week.id,
          guestToken: viewer.guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          displayName: state.yourName,
          option,
        },
      });
      track("chain_self_answered", { week: state.week.id, from: "link" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function guess(
    value: { subjectName: string; option: ChainOption; because: string },
    back: boolean,
  ) {
    if (!viewer.guestToken || busy || !state) return;
    setBusy(true);
    try {
      const result = await saveGuess({
        data: {
          weekId: state.week.id,
          guestToken: viewer.guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          guesserName: state.yourName,
          subjectName: value.subjectName,
          guessedOption: value.option,
          ...(value.because.trim() ? { because: value.because.trim() } : {}),
          ...(back ? { replyToToken: token } : {}),
        },
      });
      track(back ? "chain_guess_back" : "chain_passed_on", {
        week: state.week.id,
        with_reason: Boolean(value.because.trim()),
      });
      if (!back) {
        setPassLink({
          url: `${window.location.origin}/c/${result.token}`,
          name: value.subjectName,
        });
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          {state.senderName} guessed you
        </p>

        {step === "guess_back" && (
          <>
            <h1 className="mt-6 text-3xl leading-snug">Which one is {state.senderName}?</h1>
            <ChainGuess
              question={question}
              fixedName={state.senderName}
              busy={busy}
              onDone={(value) => void guess(value, true)}
            />
          </>
        )}

        {step === "self" && (
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
          </>
        )}

        {step === "pass" && (
          <>
            <h1 className="mt-6 text-3xl leading-snug">Now guess someone else.</h1>
            <ChainGuess
              question={question}
              busy={busy}
              onDone={(value) => void guess(value, false)}
              onSkip={() => {
                setSkipped(true);
                track("chain_pass_skipped", { week: state.week.id });
              }}
            />
          </>
        )}

        {step === "reveal" && (
          <>
            <div className="mt-8 flex flex-col gap-6">
              <div>
                <p className="text-xl">
                  {state.theirGuess.name} guessed you {state.theirGuess.guessed}
                </p>
                {state.theirGuess.because && (
                  <p className="text-base text-muted-foreground">“{state.theirGuess.because}”</p>
                )}
                <p className="text-xl text-muted-foreground">
                  You said {state.theirGuess.yourAnswer}
                </p>
              </div>

              {state.myGuess && (
                <div>
                  <p className="text-xl">
                    You guessed {state.myGuess.name} {state.myGuess.guessed}
                  </p>
                  {state.myGuess.because && (
                    <p className="text-base text-muted-foreground">“{state.myGuess.because}”</p>
                  )}
                  <p className="text-xl text-muted-foreground">
                    {state.myGuess.name} said {state.myGuess.theirAnswer}
                  </p>
                </div>
              )}
            </div>

            {state.sentence && <p className="mt-8 text-2xl">{state.sentence}</p>}

            {state.otherReads.length > 0 && (
              <div className="mt-10 flex flex-col gap-3">
                {state.otherReads.map((line, i) => (
                  <div key={i}>
                    <p className="text-lg">{line.text}</p>
                    {line.because && (
                      <p className="text-base text-muted-foreground">“{line.because}”</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {passLink && (
              <div className="mt-12">
                <p className="text-base text-muted-foreground">Send this to {passLink.name}.</p>
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `${passLink.name} — I guessed you on this week's question. 30 seconds, no signup. ${passLink.url}`,
                      )
                      .then(() => setCopied(true));
                    track("chain_link_copied", { from: "pass" });
                  }}
                  className="btn-ink mt-4 w-full py-5 text-lg"
                >
                  {copied ? "Copied" : "Copy message + link"}
                </button>
              </div>
            )}

            <div className="mt-14">
              <p className="text-xl">Want to know {state.senderName} better?</p>
              <button
                onClick={() => {
                  track("chain_bridge_tapped", { week: state.week.id });
                  void navigate({ to: "/remote" });
                }}
                className="mt-4 w-full rounded-full border-2 border-primary px-6 py-4 text-lg text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                Three questions →
              </button>
            </div>
          </>
        )}

        <Link
          to="/chain"
          className="mt-14 self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          This week's read
        </Link>
      </section>
    </main>
  );
}

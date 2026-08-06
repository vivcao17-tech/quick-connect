import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Thread } from "@/components/Thread";
import { getGuestToken } from "@/lib/guest";
import { answerAsRecipient, getInvite, startInvite } from "@/lib/remote.functions";
import type { OptionKey, PlayQuestion } from "@/lib/remote-shared";

export const Route = createFileRoute("/i/$token")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Someone answered three questions for you — Beside" },
      {
        name: "description",
        content: "3 questions · 30 seconds · no signup. They've already answered. Your turn.",
      },
      { property: "og:title", content: "3 questions · 30 seconds" },
      { property: "og:description", content: "They've already answered. Your turn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "3 questions · 30 seconds" },
      { name: "twitter:description", content: "They've already answered. Your turn." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Reveal = {
  senderName: string;
  sender: { optionKey: OptionKey; reason: string } | null;
  mine: { optionKey: OptionKey; reason: string } | null;
  revealed: boolean;
};

function InvitePage() {
  const { token } = Route.useParams();
  const [guestToken, setGuestToken] = useState("");
  const [intro, setIntro] = useState<{
    senderName: string;
    note: string;
    recipientLabel: string;
    questionCount: number;
  } | null>(null);
  const [stage, setStage] = useState<"landing" | "play" | "done">("landing");
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useServerFn(getInvite);
  const start = useServerFn(startInvite);
  const answer = useServerFn(answerAsRecipient);

  useEffect(() => {
    setGuestToken(getGuestToken());
    load({ data: { token } })
      .then((result) => setIntro(result))
      .catch(() => setError("This link doesn't exist."));
  }, [token, load]);

  const current = questions[index];

  async function begin() {
    if (!guestToken || busy) return;
    setBusy(true);
    try {
      const result = await start({ data: { token, guestToken } });
      setQuestions(result.questions);
      setIndex(0);
      setStage("play");
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(optionKey: OptionKey, chipText?: string) {
    if (!current || busy) return;
    setBusy(true);
    try {
      const text = chipText ?? reason.trim();
      const result = await answer({
        data: {
          token,
          guestToken,
          sessionQuestionId: current.sessionQuestionId,
          optionKey,
          ...(text ? { reasonText: text } : {}),
        },
      });
      setReveal(result);
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setReason("");
    setReveal(null);
    if (index + 1 < questions.length) setIndex(index + 1);
    else setStage("done");
  }

  const labelOf = (key: OptionKey | undefined | null) =>
    current?.options.find((option) => option.key === key)?.label ?? "";

  return (
    <main className="paper min-h-screen bg-background">
      {stage === "landing" && (
        <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          {error && <p className="text-lg">{error}</p>}
          {!error && intro && (
            <>
              <h1 className="text-5xl leading-[1.05]">
                {intro.senderName}
                <br />
                <em className="italic text-primary">has already answered.</em>
              </h1>
              {intro.note && (
                <p className="mt-8 text-2xl leading-snug italic">"{intro.note}"</p>
              )}
              <p className="mt-8 text-muted-foreground">
                {intro.questionCount} questions · 30 seconds · no signup
              </p>
              <button onClick={begin} disabled={busy} className="btn-ink mt-8 self-start hover:opacity-90">
                Start
              </button>
            </>
          )}
        </section>
      )}

      {stage === "play" && current && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <h1 className="text-4xl leading-tight">{current.text}</h1>

          {!reveal && (
            <>
              <div className="mt-10 flex flex-col gap-3">
                {current.options.map((option) => (
                  <button
                    key={option.key}
                    disabled={busy}
                    onClick={() => choose(option.key)}
                    className="card-soft px-6 py-5 text-left text-lg hover:border-primary disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why? (one line, optional)"
                className="mt-6 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
              {current.chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.chips.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setReason(chip.text)}
                      className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
                    >
                      {chip.text}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {reveal && (
            <div className="mt-10">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">You</p>
                  <p className="mt-2 text-2xl">{labelOf(reveal.mine?.optionKey)}</p>
                  {reveal.mine?.reason && (
                    <p className="mt-1 text-base italic text-muted-foreground">
                      "{reveal.mine.reason}"
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
                    {reveal.senderName}
                  </p>
                  <p className="mt-2 text-2xl text-primary">{labelOf(reveal.sender?.optionKey)}</p>
                  {reveal.sender?.reason && (
                    <p className="mt-1 text-base italic text-muted-foreground">
                      "{reveal.sender.reason}"
                    </p>
                  )}
                </div>
              </div>

              <Thread guestToken={guestToken} sessionQuestionId={current.sessionQuestionId} />

              <button onClick={next} className="btn-quiet mt-10 hover:bg-secondary">
                {index + 1 < questions.length ? "Next" : "That's the last one"}
              </button>
            </div>
          )}

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "done" && (
        <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
          <h1 className="text-4xl">Now go talk to them.</h1>
        </section>
      )}
    </main>
  );
}

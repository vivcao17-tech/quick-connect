import { fillName } from "@/components/QuestionText";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { Thread } from "@/components/Thread";
import { getPairSummary } from "@/lib/remote.functions";
import { useRevealPrompts } from "@/lib/use-reveal-prompts";

type Summary = Awaited<ReturnType<typeof getPairSummary>>;

/** The shared post-reveal view: every question, both answers, thread counts, and a discussion. */
export function PairSummary({
  guestToken,
  sessionId,
  title,
  initialQuestionId,
}: {
  guestToken: string;
  sessionId: string;
  title: string;
  initialQuestionId?: string | undefined;
}) {
  const load = useServerFn(getPairSummary);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [focused, setFocused] = useState(initialQuestionId ?? "");

  const refresh = useCallback(() => {
    if (!guestToken || !sessionId) return;
    void load({ data: { guestToken, sessionId } })
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [guestToken, sessionId, load]);

  useEffect(refresh, [refresh]);

  const question = summary?.questions.find((q) => q.sessionQuestionId === focused);
  const otherName = summary?.otherName ?? "them";
  const ai = useRevealPrompts(
    guestToken,
    question?.sessionQuestionId ?? "",
    Boolean(question?.revealed),
  );


  if (question) {
    return (
      <div>
        <button
          onClick={() => {
            setFocused("");
            refresh();
          }}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          All questions
        </button>

        <div className="mt-6 border-b border-border pb-6">
          <h2 className="text-3xl leading-tight">{fillName(question.text, otherName)}</h2>
          <p className="mt-6 text-base">
            <span className="text-muted-foreground">You: </span>
            {question.myLabel || "—"}
          </p>
          {question.myReason && (
            <p className="text-base italic text-muted-foreground">"{question.myReason}"</p>
          )}
          <p className="mt-2 text-base">
            <span className="text-muted-foreground">{otherName}: </span>
            <span className={question.differs ? "text-primary" : ""}>
              {question.revealed ? question.theirLabel || "—" : `Waiting for ${otherName}`}
            </span>
          </p>
          {question.theirReason && (
            <p className="text-base italic text-muted-foreground">"{question.theirReason}"</p>
          )}
        </div>

        {question.revealed ? (
          <>
            {ai.observation && <p className="mt-6 text-lg leading-snug">{ai.observation}</p>}
            <Thread
              guestToken={guestToken}
              sessionQuestionId={question.sessionQuestionId}
              prompts={ai.prompts}
            />
          </>
        ) : (
          <p className="mt-8 text-lg text-muted-foreground italic">Waiting for {otherName}.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl leading-tight">{title}</h2>
      <div className="mt-8 flex flex-col gap-3">
        {(summary?.questions ?? []).map((q) => (
          <button
            key={q.sessionQuestionId}
            onClick={() => setFocused(q.sessionQuestionId)}
            className="card-soft px-6 py-5 text-left"
          >
            <p className="text-lg">{fillName(q.text, otherName)}</p>
            <p className="mt-3 text-base">
              <span className="text-muted-foreground">You: </span>
              {q.myLabel || "—"}
            </p>
            <p className="mt-1 text-base">
              <span className="text-muted-foreground">{otherName}: </span>
              <span className={q.differs ? "text-primary" : ""}>
                {q.revealed ? q.theirLabel || "—" : `Waiting for ${otherName}`}
              </span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {q.threadCount === 0
                ? "Nothing said yet"
                : `${q.threadCount} ${q.threadCount === 1 ? "line" : "lines"} between you`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

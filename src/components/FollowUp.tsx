import { useEffect, useRef } from "react";

import { track } from "@/lib/track";

/**
 * The open question that comes after a reveal. It sits below the two answers
 * and above the thread, with two equally weighted choices: answer it, or move
 * on. No "optional" label — the second button says that on its own.
 *
 * Renders nothing when the bank row has no follow-up, so questions without one
 * skip this step entirely.
 */
export function FollowUp({
  text,
  questionId,
  sessionQuestionId,
  sessionId,
  onSpill,
  onNext,
  nextLabel = "Next",
}: {
  text?: string | null;
  questionId: string;
  sessionQuestionId: string;
  sessionId?: string | undefined;
  onSpill: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const shown = useRef("");
  useEffect(() => {
    if (!text || shown.current === sessionQuestionId) return;
    shown.current = sessionQuestionId;
    track(
      "follow_up_shown",
      { question_id: questionId, session_question_id: sessionQuestionId, follow_up: text },
      { sessionId: sessionId ?? null },
    );
  }, [text, questionId, sessionQuestionId, sessionId]);

  if (!text) return null;

  const props = {
    question_id: questionId,
    session_question_id: sessionQuestionId,
    follow_up: text,
  };

  return (
    <div className="mt-10 border-t border-border pt-8">
      <p className="text-2xl leading-snug">{text}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            track("follow_up_opened", props, { sessionId: sessionId ?? null });
            onSpill();
          }}
          className="btn-ink w-full justify-center text-center"
        >
          Spill the tea 👀
        </button>
        <button
          onClick={() => {
            track("follow_up_skipped", props, { sessionId: sessionId ?? null });
            onNext();
          }}
          className="btn-quiet w-full justify-center text-center hover:bg-secondary"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";

import { stemFor } from "@/lib/chain-shared";
import type { ChainOption, ChainQuestion } from "@/lib/chain-shared";

/**
 * Name first, then the judgment. Typing the name is what makes the guess about
 * a specific person; the question only renders once there is a subject in it.
 * The reason line is always optional and never blocks.
 */
export function ChainGuess({
  question,
  fixedName,
  onDone,
  onSkip,
  busy,
}: {
  question: ChainQuestion;
  fixedName?: string;
  onDone: (value: { subjectName: string; option: ChainOption; because: string }) => void;
  onSkip?: () => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState(fixedName ?? "");
  const [picked, setPicked] = useState<ChainOption | null>(null);
  const [why, setWhy] = useState("");

  const name = (fixedName ?? typed).trim();
  const named = name.length > 0;

  if (picked) {
    return (
      <div className="mt-8">
        <p className="text-xl">
          You guessed {name} {picked === "a" ? question.optionA : question.optionB}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-lg text-muted-foreground">Because</span>
          <input
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            maxLength={160}
            autoFocus
            className="flex-1 rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
          />
          <button
            aria-label="Continue"
            disabled={busy}
            onClick={() => onDone({ subjectName: name, option: picked, because: why })}
            className="btn-ink px-5 py-3 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <button
          onClick={() => onDone({ subjectName: name, option: picked, because: "" })}
          disabled={busy}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
        >
          Skip
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {!fixedName && (
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Their name"
          maxLength={40}
          className="w-full rounded-full border border-border bg-card px-6 py-4 text-xl outline-none focus:border-primary"
        />
      )}

      {named && (
        <>
          <p className="mt-8 text-3xl leading-snug">{stemFor(question, name)}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => setPicked("a")}
              className="card-soft px-6 py-5 text-left text-xl hover:border-primary"
            >
              {question.optionA}
            </button>
            <button
              onClick={() => setPicked("b")}
              className="card-soft px-6 py-5 text-left text-xl hover:border-primary"
            >
              {question.optionB}
            </button>
          </div>
        </>
      )}

      {onSkip && (
        <button
          onClick={onSkip}
          className="mt-8 text-sm text-muted-foreground underline underline-offset-4"
        >
          Skip this
        </button>
      )}
    </div>
  );
}

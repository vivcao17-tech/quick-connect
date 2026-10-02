import { useState } from "react";
import { Button } from "@/components/ui/button";

export type PersonQuestion = {
  key: string;
  text: string;
  optionA: string;
  optionB: string;
  tagA: string | null;
  tagB: string | null;
};

export type PersonGuesser = {
  name: string;
  picks: Record<string, string>;
};

/** Shared owner/example comparison: one question per row, one person per column. */
export function PersonImpressionView({
  questions,
  guessers,
  onFollowup,
}: {
  questions: PersonQuestion[];
  guessers: PersonGuesser[];
  onFollowup?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const people = guessers.slice(0, 5);

  return (
    <section aria-label="By person" className="min-w-0">
      <div className="overflow-x-auto border-y border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-12 min-w-12 py-4 pr-2 align-top text-xs font-normal text-muted-foreground">#</th>
              {people.map((person, index) => (
                <th scope="col" key={`${person.name}-${index}`} className="min-w-32 px-2 py-4 align-top font-medium sm:min-w-36">
                  <span className="block break-words text-base">{person.name}</span>
                  {onFollowup && (
                    <Button
                      type="button"
                      variant="link"
                      className="mt-1 h-auto max-w-36 whitespace-normal p-0 text-left text-xs leading-snug"
                      onClick={() => {
                        setCopiedFor(person.name);
                        onFollowup(person.name);
                      }}
                    >
                      {copiedFor === person.name ? "Message ready" : "Why did you see me that way?"}
                    </Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((question, rowIndex) => (
              <FragmentRow
                key={question.key}
                question={question}
                index={rowIndex}
                people={people}
                expanded={expanded === question.key}
                onToggle={() => setExpanded((value) => value === question.key ? null : question.key)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Tap any word to see the question it came from.</p>
    </section>
  );
}

function FragmentRow({ question, index, people, expanded, onToggle }: {
  question: PersonQuestion;
  index: number;
  people: PersonGuesser[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-border">
        <th scope="row" className="py-4 pr-2 align-middle text-xs font-normal text-muted-foreground">{String(index + 1).padStart(2, "0")}</th>
        {people.map((person, personIndex) => {
          const pick = person.picks[question.key];
          const tag = pick === "a" ? question.tagA : pick === "b" ? question.tagB : null;
          return (
            <td key={`${person.name}-${personIndex}`} className="px-2 py-4 align-middle">
              {tag ? (
                <Button type="button" variant="ghost" aria-expanded={expanded} aria-label={`${person.name}: ${tag}. Show question ${index + 1}`} onClick={onToggle} className={`h-auto min-h-9 w-full whitespace-normal break-words border px-2 py-2 text-left text-sm leading-snug ${expanded ? "border-primary bg-secondary" : "border-border bg-card"}`}>
                  {tag}
                </Button>
              ) : <span className="text-muted-foreground" aria-label="No answer or tag">—</span>}
            </td>
          );
        })}
      </tr>
      {expanded && (
        <tr className="border-t border-border bg-secondary/50">
          <td colSpan={people.length + 1} className="px-4 py-4">
            <p className="text-base font-medium">{question.text}</p>
            <p className="mt-2 text-sm text-muted-foreground">A · {question.optionA}</p>
            <p className="mt-1 text-sm text-muted-foreground">B · {question.optionB}</p>
          </td>
        </tr>
      )}
    </>
  );
}
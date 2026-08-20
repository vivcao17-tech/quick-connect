import type { ReactNode } from "react";

/**
 * Impression questions switch subject between two people, so the person being
 * asked about is named — never "they" — and marked in the sentence itself.
 */
export function withName(text: string, name?: string | null): ReactNode {
  const clean = (name ?? "").trim();
  if (!clean) return text;
  const parts = text.split(new RegExp(`(${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === clean.toLowerCase() ? (
      <span key={i} className="font-semibold underline decoration-primary underline-offset-4">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** "Which one is Tim?" / "And you?" — the subject line above an impression step. */
export function SubjectLine({ name, aboutSelf }: { name: string; aboutSelf: boolean }) {
  return (
    <p className="text-lg text-muted-foreground">
      {aboutSelf ? (
        <>
          Now <span className="font-semibold text-foreground underline decoration-primary underline-offset-4">you</span>.
        </>
      ) : (
        <>
          Which one is{" "}
          <span className="font-semibold text-foreground underline decoration-primary underline-offset-4">
            {name}
          </span>
          ?
        </>
      )}
    </p>
  );
}

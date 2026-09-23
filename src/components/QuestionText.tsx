import type { ReactNode } from "react";

import { firstName } from "@/lib/packs";

/**
 * Impression questions switch subject between two people, so the person being
 * asked about is named inside the stem itself — never "they".
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

/** Fallback when the other person hasn't been named yet (sender answers first). */
export const UNKNOWN_SUBJECT = "Your friend";

/**
 * The sentence shown for an impression step. Step "other" uses the stored
 * {name} template with the other person's display name; step "self" uses the
 * second-person wording. Falls back to the plain question text.
 */
export function impressionStem(
  question: { text: string; stemOther?: string | null; stemSelf?: string | null },
  step: "other" | "self",
  otherName?: string | null,
) {
  if (step === "self") return question.stemSelf || "And you?";
  const template = question.stemOther ?? question.text;
  return template.replace(/\{name\}/g, subjectName("other", otherName));
}

/** The name actually rendered inside a step-1 stem, for highlighting. */
export function subjectName(step: "other" | "self", otherName?: string | null) {
  if (step === "self") return "";
  return firstName(otherName) || UNKNOWN_SUBJECT;
}

/** Plain-text fill of a stored {name} slot with the person's first name. */
export function fillName(text: string, name?: string | null) {
  return text.replace(/\{name\}/g, firstName(name) || "them");
}

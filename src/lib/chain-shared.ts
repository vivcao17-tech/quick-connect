/**
 * Chain: one impression question a week, passed friend to friend.
 *
 * Shared vocabulary between server and screens. Questions are stored with a
 * `{name}` slot so the same row renders as a judgment about a specific person
 * ("When Tim is upset, Tim —") or about yourself.
 */

export type ChainOption = "a" | "b";

export type ChainQuestion = {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
};

export type ChainWeek = {
  id: string;
  opensAt: string;
  settlesAt: string;
  open: boolean;
  question: ChainQuestion;
};

/** The stem with a person's name inside it, so the subject exists before the judgment. */
export function stemFor(question: ChainQuestion, name: string): string {
  const clean = name.trim() || "they";
  return question.text.replace(/\{name\}/g, clean).replace(/\s+,/g, ",");
}

/** The same stem pointed at the reader. */
export function selfStem(question: ChainQuestion): string {
  return question.text.replace(/\{name\}/g, "you");
}

export function optionLabel(question: ChainQuestion, option: ChainOption | null | undefined) {
  if (option === "a") return question.optionA;
  if (option === "b") return question.optionB;
  return "";
}

/** Plain, unscored sentence for a mutual reveal. */
export function revealSentence(opts: {
  otherName: string;
  theyReadYou: boolean | null;
  youReadThem: boolean | null;
}): string {
  const name = opts.otherName.trim() || "They";
  if (opts.theyReadYou === null || opts.youReadThem === null) return "";
  if (opts.theyReadYou && opts.youReadThem) return "You read each other.";
  if (opts.youReadThem) return `You read ${name}. ${name} didn't read you.`;
  if (opts.theyReadYou) return `${name} read you. You didn't read ${name}.`;
  return `Neither of you saw it coming.`;
}

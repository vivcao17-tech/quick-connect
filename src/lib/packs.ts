/**
 * Packs group 1:1 questions into four things a pair can build up over rounds.
 * Chain and group modes never touch this file — they keep topic selection.
 */
export const PACKS = ["click", "talk", "bring_out", "clash"] as const;
export type Pack = (typeof PACKS)[number];

export function isPack(value: unknown): value is Pack {
  return typeof value === "string" && (PACKS as readonly string[]).includes(value);
}

export const PACK_LABEL: Record<Pack, string> = {
  click: "Click",
  talk: "Talk",
  bring_out: "Bring out",
  clash: "Clash",
};

export const PACK_TAGLINE: Record<Pack, string> = {
  click: "Plans, pace, and energy",
  talk: "What you're both curious about",
  bring_out: "Your roles with each other",
  clash: "How you handle the hard stuff",
};

/** The title of the read a pair unlocks once a pack has enough answers. */
export const PACK_READ_TITLE: Record<Pack, string> = {
  click: "How you click",
  talk: "How you talk",
  bring_out: "What you bring out",
  clash: "Where you clash",
};

export const DEFAULT_PACK_LABEL = "A bit of everything";
export const DEFAULT_PACK_TAGLINE = "Two easy ones and one guess about each other";

export function roundsToUnlock(pack: PackState, anotherUnlocked: boolean) {
  if (pack.unlocked) return "";
  if (pack.pack === "clash" && !anotherUnlocked) return "Opens after you unlock another one";
  const rounds = Math.ceil(Math.max(0, pack.threshold - pack.answered) / 2);
  if (rounds === 1) return "One more round to unlock";
  if (rounds === 2) return "Two more rounds to unlock";
  return "A few more rounds to unlock";
}

/** Impression stems name the person, and a full name reads wrong mid-sentence. */
export function firstName(name?: string | null) {
  const clean = (name ?? "").trim();
  if (!clean) return "";
  return clean.split(/\s+/)[0] ?? clean;
}

export type PackState = {
  pack: Pack;
  label: string;
  tagline: string;
  readTitle: string;
  threshold: number;
  order: number;
  answered: number;
  unlocked: boolean;
  remaining: number;
};

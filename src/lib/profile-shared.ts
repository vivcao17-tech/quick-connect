/**
 * A fixed list of things people can say about themselves. Fixed on purpose:
 * a public page with free composition is a moderation surface we don't want.
 */
export const PROFILE_PROMPTS: { key: string; label: string }[] = [
  { key: "sunday", label: "A good Sunday looks like" },
  { key: "loud", label: "I'm louder than people expect about" },
  { key: "text_back", label: "I text back fastest when" },
  { key: "food", label: "The meal I'd order every time" },
  { key: "changed", label: "Something I changed my mind about" },
  { key: "leaves", label: "I'm the first to leave when" },
  { key: "song", label: "The song I put on twice" },
  { key: "ask_me", label: "Ask me about" },
];

export const PROMPT_MAX = 200;

/** Plain short text only: no markup, no links, no line breaks. */
export function cleanPromptAnswer(raw: string) {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROMPT_MAX);
}

/** A handle nobody can guess from an internal id, derived from a name. */
export function handleFrom(name: string, salt: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 14) || "friend";
  return `${base}-${salt.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}`;
}

export type ProfileImpression = {
  questionId: string;
  text: string;
  stemSelf: string | null;
  stemOther: string | null;
  options: { key: string; label: string }[];
  counts: Record<string, number>;
  total: number;
  selfKey: string | null;
  hidden: boolean;
};

export type ProfileData = {
  profileId: string;
  handle: string | null;
  displayName: string;
  impressions: ProfileImpression[];
  prompts: { key: string; answer: string; visible: boolean }[];
  newSince: number;
};

/** Percentage with the sample size alongside — "2 of 2", never a bare 100%. */
export function share(count: number, total: number) {
  if (total === 0) return { percent: 0, label: "0 of 0" };
  return { percent: Math.round((count / total) * 100), label: `${count} of ${total}` };
}

/** The gap between how people read someone and how they read themselves. */
export function topOption(imp: ProfileImpression) {
  let best: { key: string; count: number } | null = null;
  for (const option of imp.options) {
    const count = imp.counts[option.key] ?? 0;
    if (!best || count > best.count) best = { key: option.key, count };
  }
  return best;
}

export function isMismatch(imp: ProfileImpression) {
  const top = topOption(imp);
  return Boolean(imp.selfKey && top && top.count > 0 && top.key !== imp.selfKey);
}

export function labelOf(imp: ProfileImpression, key: string | null) {
  return imp.options.find((o) => o.key === key)?.label ?? "";
}

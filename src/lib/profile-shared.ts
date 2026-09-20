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
  return `${base}-${salt
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toLowerCase()}`;
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
  /** True once the owner has made an explicit choice about this question. */
  hasPref?: boolean;
  /** When the most recent read on this question came in. */
  lastAt?: string | null;
  /** Owner-only: reads that arrived since they last opened their wall. */
  newCount?: number;
};

export type ProfileData = {
  profileId: string;
  handle: string | null;
  displayName: string;
  impressions: ProfileImpression[];
  prompts: { key: string; answer: string; visible: boolean }[];
  newSince: number;
  /** True once the owner has made any show/hide choice; then only their picks publish. */
  curated?: boolean;
  /** Owner-only: new reads on questions that aren't on the public wall right now. */
  undisplayedNew?: number;
};

/** How many impression questions a public wall shows before "See all". */
export const WALL_PREVIEW_COUNT = 4;

/** How many self-authored prompts a public wall shows before "More about me". */
export const PUBLIC_PROMPT_PREVIEW_COUNT = 3;

/** The question as it should read on a wall, with the name filled in. */
export function wallText(imp: ProfileImpression, name: string) {
  return (imp.stemOther ?? imp.text).replace(/\{name\}/g, name);
}

/** Is this read published, given whether the wall is a hand-picked selection. */
export function onWall(imp: ProfileImpression, curated: boolean) {
  return curated ? Boolean(imp.hasPref) && !imp.hidden : !imp.hidden;
}

/** Most recent read first. */
export function byRecency(a: ProfileImpression, b: ProfileImpression) {
  return new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime();
}

/** Owner view: anything new first, then most recent. */
export function byNewThenRecency(a: ProfileImpression, b: ProfileImpression) {
  const fresh = (b.newCount ?? 0) - (a.newCount ?? 0);
  if (fresh !== 0) return fresh;
  return byRecency(a, b);
}

/** Mismatch first (most surprising first), ties broken by sample size. */
export function byMismatch(a: ProfileImpression, b: ProfileImpression) {
  const rate = mismatchRate(b) - mismatchRate(a);
  if (rate !== 0) return rate;
  return b.total - a.total;
}

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

/** Share of reads that landed on a different side than the person's own answer. */
export function mismatchRate(imp: ProfileImpression) {
  if (!imp.selfKey || imp.total === 0) return 0;
  const agreed = imp.counts[imp.selfKey] ?? 0;
  return (imp.total - agreed) / imp.total;
}

export function isMismatch(imp: ProfileImpression) {
  const top = topOption(imp);
  return Boolean(imp.selfKey && top && top.count > 0 && top.key !== imp.selfKey);
}

export function labelOf(imp: ProfileImpression, key: string | null) {
  return imp.options.find((o) => o.key === key)?.label ?? "";
}

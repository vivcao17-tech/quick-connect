type SplitSide = {
  names: string[];
  mine: boolean;
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function countWord(count: number) {
  return (
    ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][count] ?? String(count)
  );
}

export function pairRevealGuidance(otherName: string, matched: boolean) {
  const name = otherName.trim() || "your friend";
  return matched
    ? `You and ${name} picked the same. Same answer — same reason?`
    : `You and ${name} went different ways. Ask ${name} why.`;
}

export function groupRevealGuidance(sides: SplitSide[]) {
  const answered = sides.filter((side) => side.names.length > 0);
  if (answered.length <= 1) return "All of you. Next.";

  const ordered = [...answered].sort((a, b) => a.names.length - b.names.length);
  const smallest = ordered[0];
  const largest = ordered[ordered.length - 1];
  if (!smallest || !largest) return "Look at where everyone landed.";

  const tiedSmallest =
    ordered.filter((side) => side.names.length === smallest.names.length).length > 1;
  const isMinority =
    smallest.names.length <= 2 && smallest.names.length < largest.names.length && !tiedSmallest;
  if (isMinority) {
    if (smallest.mine) {
      const others = smallest.names.filter((name) => name !== "You");
      return smallest.names.length === 1
        ? "You're the only one. Last time this happened…"
        : `Just you and ${joinNames(others)}. Last time this happened…`;
    }
    const names = joinNames(smallest.names);
    return `${smallest.names.length === 1 ? "Only" : "Just"} ${names} picked that. Ask ${names} why.`;
  }

  const counts = answered.map((side) => side.names.length).sort((a, b) => b - a);
  return `${counts.map(countWord).join(" and ")}. Each side, say why — then see if anyone switches.`;
}

export function mergeRemoteOpening(observation: string, guidance: string) {
  const clean = observation.trim().replace(/[.!?]+$/, "");
  if (!clean) return guidance;
  const action = guidance.includes("Ask ")
    ? guidance.slice(guidance.indexOf("Ask ")).replace(/^Ask/, "ask")
    : guidance.includes("Same answer")
      ? "same answer — same reason?"
      : guidance;
  return `${clean} — ${action}`;
}

export function RevealGuidance({
  text,
  interactive = false,
  onActivate,
}: {
  text: string;
  interactive?: boolean;
  onActivate?: () => void;
}) {
  const className =
    "mt-8 w-full rounded-2xl border-2 border-primary bg-card px-5 py-5 text-left text-xl leading-snug text-foreground";

  if (interactive) {
    return (
      <button type="button" onClick={onActivate} className={`${className} hover:bg-secondary`}>
        {text}
      </button>
    );
  }

  return <div className={className}>{text}</div>;
}

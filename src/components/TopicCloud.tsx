import { useMemo, useState } from "react";

export type CloudTopic = { id: string; label: string };

/** Small deterministic PRNG so a page of words looks the same across renders. */
function rng(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 4294967296;
  };
}

function seedOf(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type Placed = {
  topic: CloudTopic;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  rotate: number;
};

const BOX_W = 100; // percent-ish units
const BOX_H = 100;
const PAD = 1.5;

function overlaps(a: Placed, b: Placed) {
  return (
    a.x - PAD < b.x + b.w + PAD &&
    a.x + a.w + PAD > b.x - PAD &&
    a.y - PAD < b.y + b.h + PAD &&
    a.y + a.h + PAD > b.y - PAD
  );
}

/**
 * Words are dropped at free angles and free positions inside the panel; every
 * candidate placement is collision-checked against the words already placed and
 * re-rolled (then shrunk) until it fits, so nothing can ever overlap.
 */
function layout(topics: CloudTopic[], seed: number): Placed[] {
  const random = rng(seed);
  const placed: Placed[] = [];

  for (const topic of topics) {
    let size = 1.7 + random() * 1.1; // rem
    let done = false;

    for (let attempt = 0; attempt < 400 && !done; attempt += 1) {
      if (attempt > 0 && attempt % 80 === 0) size = Math.max(1.05, size * 0.85);

      const rotate = Math.round((random() * 2 - 1) * 34);
      const radians = (Math.abs(rotate) * Math.PI) / 180;
      // Rough glyph metrics — good enough for a non-overlap guarantee with padding.
      const rawW = topic.label.length * size * 3.6;
      const rawH = size * 6.2;
      const w = rawW * Math.cos(radians) + rawH * Math.sin(radians);
      const h = rawW * Math.sin(radians) + rawH * Math.cos(radians);
      if (w > BOX_W || h > BOX_H) continue;

      const candidate: Placed = {
        topic,
        x: random() * (BOX_W - w),
        y: random() * (BOX_H - h),
        w,
        h,
        size,
        rotate,
      };
      if (placed.every((other) => !overlaps(candidate, other))) {
        placed.push(candidate);
        done = true;
      }
    }

    if (!done) {
      // Last resort: stack it under everything already placed, still non-overlapping.
      const bottom = placed.reduce((max, p) => Math.max(max, p.y + p.h), 0);
      const h = 1.05 * 6.2;
      placed.push({
        topic,
        x: 2,
        y: Math.min(bottom + 2, BOX_H - h),
        w: topic.label.length * 1.05 * 3.6,
        h,
        size: 1.05,
        rotate: 0,
      });
    }
  }

  return placed;
}

export function TopicCloud({
  topics,
  selectedIds,
  onToggle,
  disabled = false,
  perPage = 6,
}: {
  topics: CloudTopic[];
  selectedIds: string[];
  onToggle: (topic: CloudTopic) => void;
  disabled?: boolean;
  perPage?: number;
}) {
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(topics.length / perPage));
  const visible = useMemo(() => {
    const start = (page % pages) * perPage;
    const slice = topics.slice(start, start + perPage);
    return slice.length < perPage ? [...slice, ...topics.slice(0, perPage - slice.length)] : slice;
  }, [topics, page, pages, perPage]);

  const placed = useMemo(
    () => layout(visible, seedOf(visible.map((t) => t.id).join("|")) + page),
    [visible, page],
  );

  return (
    <div>
      <div className="relative h-[26rem] w-full">
        {placed.map((spot) => {
          const chosen = selectedIds.includes(spot.topic.id);
          return (
            <button
              key={spot.topic.id}
              disabled={disabled}
              onClick={() => onToggle(spot.topic)}
              className={`topic-word absolute origin-center leading-none whitespace-nowrap transition-transform hover:scale-105 hover:text-primary disabled:opacity-40 ${
                chosen ? "text-primary" : ""
              }`}
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                fontSize: `${spot.size}rem`,
                transform: `rotate(${spot.rotate}deg)`,
              }}
            >
              {spot.topic.label}
            </button>
          );
        })}
      </div>

      {topics.length > perPage && (
        <button
          onClick={() => setPage((value) => value + 1)}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Shuffle
        </button>
      )}
    </div>
  );
}

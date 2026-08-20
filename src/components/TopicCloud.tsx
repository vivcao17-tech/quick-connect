import { useMemo, useState } from "react";

export type CloudTopic = { id: string; label: string };

/** Deterministic per-id jitter so a word doesn't jump around on every render. */
function jitterOf(id: string, slot: number) {
  let hash = slot * 2654435761;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const pick = (shift: number, span: number) => ((hash >> shift) % span) - Math.floor(span / 2);
  return {
    rotate: pick(3, 13),
    x: pick(9, 15),
    y: pick(15, 13),
    size: 1.9 + ((hash >> 21) % 7) / 10,
  };
}

/**
 * A loose two-column grid with jitter: each word owns a cell, so nothing can
 * ever land on top of anything else, and only one screenful shows at a time.
 */
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
    // Wrap so the last page is never a lonely single word.
    return slice.length < perPage ? [...slice, ...topics.slice(0, perPage - slice.length)] : slice;
  }, [topics, page, pages, perPage]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
        {visible.map((topic, slot) => {
          const spot = jitterOf(topic.id, slot);
          const chosen = selectedIds.includes(topic.id);
          return (
            <div key={topic.id} className="flex min-h-16 items-center">
              <button
                disabled={disabled}
                onClick={() => onToggle(topic)}
                className={`topic-word origin-left leading-none transition-transform hover:scale-105 hover:text-primary disabled:opacity-40 ${
                  chosen ? "text-primary" : ""
                }`}
                style={{
                  fontSize: `${spot.size}rem`,
                  transform: `translate(${spot.x}px, ${spot.y}px) rotate(${spot.rotate}deg)`,
                }}
              >
                {topic.label}
              </button>
            </div>
          );
        })}
      </div>

      {topics.length > perPage && (
        <button
          onClick={() => setPage((value) => value + 1)}
          className="mt-8 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Shuffle
        </button>
      )}
    </div>
  );
}

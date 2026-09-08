# Make the end-of-room save prompt measurable and hard to miss

The 8/21 room recorded nothing after the last answer, so "0% capture" can't be read as a rejection. Two changes: record when the ending is actually seen, and put the save step where people will see it.

## 1. Know whether the prompt was seen

Record two new moments, once per person per room:

- **Ending reached** — someone's phone lands on the final screen.
- **Save step seen** — the "Continue with Google / or leave an email" block is actually on screen (fires when it scrolls into view, not merely when the page renders).

Same two moments in every mode that ends with a save step: in-person group, in-person 1:1, remote 1:1, and remote async group.

On the admin dashboard, capture rate is then reported against people who saw the save step, with the raw counts beside it:

```text
Ending reached      6
Save step seen      2
Saved (email/Google) 0     0% of 2 seen
```

Rooms where nobody reached the ending are listed separately as "ended without an end screen" rather than counted as refusals.

## 2. Make the ending land on the save step

Today the group ending shows the disagreement headline, then the "Keep going with X" action, then every question's results, then the added-people list — and only then the save block, several screens down. On a phone the room simply ends and people put it away.

Changes to the group ending:

- Move the save step directly under the headline, above the per-question results.
- Keep it to one line of framing plus the two actions, so it reads as the natural close.
- Once saved, it collapses to the confirmation line and the results move up.
- Apply the same ordering to the in-person 1:1 and remote endings so all four modes close the same way.

No new copy claims, no extra prompts mid-session — only the ordering and the two tracking moments change.

## Technical notes

- New `events` names: `end_screen_shown` and `save_prompt_shown`, with `props.kind` (`group`, `irl_pair`, `remote`, `group_async`) and `session_id` / `participant_id`, logged through the existing `track` helper. Fired once per mount, guarded by a ref so scroll doesn't duplicate them.
- Visibility detection via `IntersectionObserver` on the save block.
- `admin_overview` / `admin_session_rows` in `src/lib/admin.server.ts` gain `endShown`, `savePromptShown`, and a capture rate based on `savePromptShown`; the dashboard and CSV export pick up the new columns.
- Layout edits in `GroupRoom.tsx`, `Room.tsx`, `PairSummary.tsx`, and `AsyncGroupRoom.tsx`. No schema change and no migration — `events` already stores this shape.
- Historic rooms have no such events, so the dashboard shows "not tracked" for anything before this ships rather than a misleading 0%.

# Group friend history by topic

## What will change

- Replace the current session-card history on a friend page with one card per actual topic.
- Within each topic card, list every discussed question in a compact vertical list with both answers and existing message/unread details.
- Make each question link directly into its existing conversation using its current session and session-question identifiers.
- Sort topic cards and their question rows by latest activity, newest first, while deduplicating by session-question identifier.
- Preserve the existing friend wall link, notes, send-again section, answers, and thread behavior.

## Data handling

- Extend the existing relationship-detail query to return each question’s stored topic ID and label; grouping will use the ID, never the displayed label.
- Keep questions that were answered or revealed even when they have no thread messages.
- Reuse the current relationship/session/question objects and current `/with/:person/:session?q=:sessionQuestion` thread destination; no new tables or conversation system.

## Verification

- Check that one topic produces one outer card, repeated topic labels with distinct IDs stay separate, and duplicate joined rows do not duplicate questions.
- Check newest-first topic/question ordering and direct thread navigation.
- Verify the friend page at desktop and mobile widths with no horizontal scrolling or runtime errors.

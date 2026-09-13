# Roadmap

## Speed up topic → first question

- [ ] `draw_questions` Postgres function: exclusion, tiers, topic spread, positional spice in one round trip
- [ ] Return per-person answer count per question so admin needs no extra query
- [ ] First question renders on selection; later questions drawn in the background
- [ ] Indexes: `answers(participant_id)`, `session_questions(question_id)`; drop duplicate `answers_sq_idx`
- [ ] Fold `getRoomState`'s 9 calls into one `room_state` function
- [ ] Verify end to end under 500 ms

## Reveal guidance and remote reveal simplification

- [x] Add shared split-aware, name-aware guidance across all four modes
- [x] Make in-person guidance static and remote guidance open a prefilled composer
- [x] Reduce remote reveals to one opening line, one fallback chip, and one 👀 reaction
- [x] Move remote follow-up questions inside the opened thread
- [x] Verify unanimous, even, minority-viewer, majority-viewer, and 1:1 states on mobile and desktop

## Profile wall display rules

- [ ] Restore `/me` navigation for signed-in owners after unread reads are cleared
- [ ] Apply uncurated mismatch-first top-four display (agreements stay, labeled "they got this one right") and curated exact-selection rules
- [ ] Add owner-only undisplayed-new-reads nudge
- [ ] Trim visible self-authored prompts to four with “See all”
- [ ] Verify owner and public wall behavior

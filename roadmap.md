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
- [x] Replace narrated remote reveal guidance with the inline “Because” first-message composer

## Profile wall display rules

- [x] Restore `/me` navigation for signed-in owners after unread reads are cleared
- [x] Apply uncurated mismatch-first top-four display (agreements stay, labeled "they got this one right") and curated exact-selection rules
- [x] Add owner-only undisplayed-new-reads nudge
- [x] Show all owner impression cards with explicit wall visibility and summary counts
- [x] Trim visible self-authored prompts to three with “More about me”
- [x] Give saved self-authored prompts explicit wall visibility controls and summary counts
- [x] Verify owner and public wall behavior

## Permanent wall entry

- [x] Home profile entry link always present and always navigates to `/me`; state only changes dot/teaser copy
- [x] Save principle to memory: wall reachability never depends on state

## Group friend history by topic

- [x] Return each question’s stored topic ID and label in the existing relationship detail
- [x] Group and deduplicate friend-history questions by topic, sorted by latest activity
- [x] Link every question row to its existing thread
- [x] Verify desktop and mobile friend-detail layouts and thread navigation

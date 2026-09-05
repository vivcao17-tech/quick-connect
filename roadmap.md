# Roadmap

## Speed up topic → first question

- [ ] `draw_questions` Postgres function: exclusion, tiers, topic spread, positional spice in one round trip
- [ ] Return per-person answer count per question so admin needs no extra query
- [ ] First question renders on selection; later questions drawn in the background
- [ ] Indexes: `answers(participant_id)`, `session_questions(question_id)`; drop duplicate `answers_sq_idx`
- [ ] Fold `getRoomState`'s 9 calls into one `room_state` function
- [ ] Verify end to end under 500 ms

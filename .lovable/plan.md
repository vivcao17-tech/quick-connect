# Fix profile-wall display rules and restore home access

## What will change

- Fix the home action so a signed-in owner with existing impression results always reaches `/me`; the unread count will only control the dot and teaser wording.
- Treat a wall with no saved visibility choices as uncurated: rank questions by mismatch rate, exclude zero-mismatch questions, show four initially, and put additional mismatches behind “See all.”
- Treat a wall with saved visibility choices as curated: publish only questions the owner explicitly selected, without automatically adding other questions.
- Apply the same four-item initial limit and “See all” behavior to visible self-authored prompts.
- On `/me`, show a one-line count of new reads on questions outside the current public selection, linking to the wall-editing section. Never show this nudge publicly.
- Preserve all answers and existing profile content; no rows will be deleted.

## Verified live-data diagnosis

- Impression answers about Xinran: **5 rows**.
- Distinct people who supplied those reads: **5**.
- Within the current 90-day wall window: **5 rows from 5 people**.
- Questions with a matching self-answer: **5 of 5**.
- Current visibility-preference rows: **0**, so the wall is uncurated.
- Mismatch breakdown: one question has one differing read; four questions have zero differing reads.
- The empty-state behavior came from the home link: after the unread marker was cleared, it linked to Start instead of `/me`. The database-backed wall function still returns the five questions.

## Technical details

- Return explicit curation state and the owner-only undisplayed-new-read count from the existing protected profile function.
- Filter public profile data server-side so non-selected curated questions never leave the server.
- Keep mismatch sorting deterministic by using response count as the tie-breaker.
- Verify signed-in home navigation, owner wall, public wall, and “See all” behavior.

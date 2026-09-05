# Making the first question appear instantly

## What I measured

The database is not slow. Every query in this path runs in well under a millisecond on the current data (118 active questions, 332 answers, 273 session questions). The delay is the number of separate calls the server makes, one after another, each paying network latency.

Measured plans:

- Question bank fetch: `Index Scan using questions_selection_idx`, **0.205 ms**, 98 rows.
- "What has this person already answered": **0.250 ms**.

So the ~5 seconds is round trips, exactly like the `/people` problem.

### Round trips, in-person flow (tapping a topic)

`chooseTopics` → 7 calls (membership, clear picks, insert picks, event, participants, picks, session) then `seedQuestions`:

```text
seedQuestions
  count existing questions                    1
  Q1 (spice 1) -> candidateQuestions          ~9-12
      session topics                    1
      answered-sets: participants       1
      per person x2: guest, profile,
                     answers            6
      question pool (1-4 attempts)      1-4
    fallback candidateQuestions if empty      ~9-12
  Q2 (spice 2) -> candidateQuestions          ~9-12
    fallback                                  ~9-12
  impression: answered-sets again + bank      8
  insert 3 session questions                  1
status update + getRoomState (9 more calls)   10
```

**Total ≈ 45-60 sequential calls.** At 80-120 ms each that is 4-6 seconds — matching what you see. The remote flow (`/remote` topic tap → `listTopicQuestions`) is milder: 5-6 calls, roughly a second.

### Is exclusion computed in SQL?

No. `answeredByPerson` pulls participant ids for the guest token, then pulls **every answer row** for those participants, builds a JavaScript `Set`, and the whole active question bank is fetched and filtered/ranked/shuffled in app code. It is also recomputed from scratch inside every retry attempt — the same person's answer history is fetched 4-6 times per topic tap.

### Indexes

- `answers.session_question_id` — present (two of them, `answers_sq_idx` is redundant).
- `session_questions.question_id` — **missing** (only `session_id` is indexed).
- `answers.participant_id` — **missing**. The plan above confirms it: `Seq Scan on answers`. Harmless at 332 rows, a real problem later.
- `questions_selection_idx` already covers the bank filter well.

## The fix

### 1. One Postgres function, one round trip

New `public.draw_questions(...)` (security definer, same pattern as `people_overview` / `relationships_detail`) that does the whole selection in SQL:

- filters `active`, `mode` matching the session type, spice ceiling;
- computes already-answered per person as a join, not a fetched loop, keyed on guest token and profile id across all their sessions;
- ranks by the agreed tiers (featured-and-unseen → unseen → seen by one → seen by both), with the shared-topic nudge;
- caps two per topic;
- honours positional spice: Q1 spice 1, Q2 spice 2, Q3 impression;
- never returns empty — falls back to allowing repeats;
- returns full question rows plus reason chips, ready to snapshot;
- also returns, per row, **how many times this person has already answered that question**, so the admin view stops issuing its own query for it.

`selection.server.ts`, `irl-helpers.ts` (`candidateQuestions`, `seedQuestions`, `pickImpressionQuestion`), `remote.functions.ts` (`listTopicQuestions`) and `async-group.server.ts` all call this one function instead of assembling pools in JavaScript. The existing ranking rules do not change — they move into SQL.

### 2. Don't block on all three questions

`chooseTopics` seeds and returns **Q1 only**, flips the room to `answering`, and returns the first question in its own response so the screen renders without waiting for the 2-second poll. Q2 and Q3 are drawn immediately afterwards in the background (excluding Q1) while the first question is on screen. The room already polls and syncs over Realtime, so the later questions appear well before anyone reaches them. If the background draw fails, the existing seeding runs on demand when the next question is requested, so a session can never stall.

Same shape for the remote and async-group flows: the first question renders on selection.

### 3. Indexes

Add `answers(participant_id)` and `session_questions(question_id)`; drop the duplicate `answers_sq_idx`.

### 4. Fold in the room state read

`getRoomState` currently makes 9 sequential calls (membership, session, participants, topics, topic picks, votes, session questions, answers, notifications) on the same screen, and the room polls it every 2 seconds. It becomes a single `public.room_state(...)` security-definer function returning one JSON payload with exactly the same shape the component reads today, so the polling loop and every Realtime-triggered refresh cost one round trip instead of nine.

### 5. Verify

Time the topic tap end to end in a real browser run before and after, and re-run `EXPLAIN (ANALYZE, BUFFERS)` on both new functions to confirm index use. Target under 500 ms; expected shape is one call of a few milliseconds plus one round trip.

## Notes

- No table changes, no changes to what players see or to which questions get chosen — only where the work happens and when the screen paints.
- The room screen's repeated state read is included in this work, so nothing on that screen is left on the old many-call path.

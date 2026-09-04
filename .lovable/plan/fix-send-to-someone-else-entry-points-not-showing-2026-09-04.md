# Fix: "Send to someone else" entry points not showing

## Diagnosis (verified against live data and the running preview)

1. **The conversations-page section works, but silently drops half your sets.**
   `/conversations` does render "Sets you've answered" with "Send to someone else" — confirmed in the live preview. But `listMyAnswerSets` (src/lib/remote.functions.ts:1287) filters sessions to `kind = 'remote'` only. Older answer sets were stored as `kind = 'remote_pair'` — your identity has 5 fully-answered `remote_pair` sets that never appear (only 6 of your 11 ready sets show).

2. **The person-page entry point almost never appears.**
   On `/with/:id`, "Send them a set you've already answered" renders only when you have **zero** shared sessions with that person (`with.$participantId.index.tsx`). Since people only get onto `/people` by sharing a session (or an invite), in practice the section is nearly unreachable — and for anyone you've ever done a set with, it's impossible to send them a *different* past set.

## Changes

### 1. Count all remote answer sets
- `src/lib/remote.functions.ts` — `listMyAnswerSets`: accept both `remote` and `remote_pair` kinds (`.in("kind", ["remote", "remote_pair"])`), still restricted to sessions where the viewer is `role = 'sender'` and has answered every question. Recipients' copies are unaffected (they aren't the sender).

### 2. Make the person-page entry always reachable
- `src/routes/with.$participantId.index.tsx`: show "Send them a set you've already answered" whenever the viewer has reusable sets — not only when `sessions.length === 0`. With existing sessions it renders as a quiet section below the session list (same set picker by topic/first question, linking to `/send/$sessionId`); with none it stays where it is.
- Label unchanged: "Send to someone else" / "Send them a set you've already answered" — no mention of answer age.

### 3. Sanity-check the send page for old sets
- `/send/$sessionId` already loads stored answers + recipient list via `getAnswerSet` / `listSessionInvites`; verify it opens correctly for both `remote` and `remote_pair` sets after change 1, with the add-recipient box generating fresh unique links.

## Out of scope
- Recipient experience stays exactly as-is (no indication of answer age or other recipients).
- The dev-overlay hydration warning (`ss-hints` div) is tooling noise, not app code — no change.

## Technical details
- One-line query change in `listMyAnswerSets`; conditional render change in the person-page route. No schema or RLS changes.
- Verify by loading `/conversations` (expect 11 sets, up from 6) and a person page with existing sessions (expect the reuse section at the bottom).

# Invites, SECURITY DEFINER functions, and the reveal lock

Findings below come from querying the live database and reading the server functions. Two of the three concerns turn out to be non-issues; the invite bug has a different cause than the missing INSERT policy.

## 1. Invites — they are written, and they persist

Verified in the database:

- `invites` holds 18 rows, oldest `2026-08-07`, newest `2026-08-19`. 14 have a `child_session_id`, 12 have `completed_at`. Nothing is being deleted or expiring.
- Creation runs through `createInvites` in `src/lib/remote.functions.ts`, which uses the privileged admin client. That path bypasses RLS, so the absence of an INSERT policy on `invites` is correct and not the bug.
- The completed session you mentioned is intact: the child session has both participants, all 3 questions revealed, and answers from both sides.

The real cause is **identity, not persistence**. Three things stack up:

- `/send/:sessionId` shows the freshly-made links from React state only. Reload the page and they are gone from that screen — there is no server fetch of existing invites there.
- Every recovery surface (`getInbox`, `getSentResults`) looks the sender up by `guest_token` **only** — `src/lib/remote.functions.ts` never reads `profile_id`. Sign in, switch device, or clear storage and the entire sent history becomes unreachable even though the rows are still there.
- `getGuestToken` in `src/lib/guest.ts` falls back to an in-memory token when `localStorage` throws (blocked third-party storage, private mode, embedded iframes). That fallback also produces non-UUID strings like `g-abc123`, which every server function rejects because the validator is `z.string().uuid()`. A browser in that state silently becomes a new anonymous person on each load.

`/conversations` looks empty for a second reason: `listConversations` filters to people with at least one **revealed** session. Pending invites — sent but not yet answered — have no partner and no reveal, so they appear nowhere in that view by construction.

### Fix

- Load existing invites on `/send/:sessionId` from the server on mount, so the links survive a reload.
- Make identity dual-keyed in `remote.functions.ts` the way `conversations.functions.ts` already is: accept optional `profileId` and match participants on `guest_token` OR `profile_id` in `getInbox` and `getSentResults`. Backfill `profile_id` on the sender participant row when a signed-in viewer opens their own session.
- Make the guest token always UUID-shaped so the fallback path cannot produce values the validators reject, and surface a visible "your history lives in this browser" note when storage is unavailable.
- Add a pending/awaiting group to `/conversations` (or link prominently to `/inbox`) so sent-but-unanswered invites are reachable rather than invisible.

## 2. SECURITY DEFINER functions

There are three, all currently executable by `anon` and `authenticated`:

| Function | Purpose | Verdict |
| --- | --- | --- |
| `is_my_participant(uuid)` | Used inside the RLS policies on `answers`, `thread_messages`, `notifications`, `thread_reads` to test caller ownership | **Keep executable.** Policy expressions are evaluated as the querying role, so revoking EXECUTE would break RLS itself. |
| `is_session_member(uuid)` | Same, for session-scoped read policies | **Keep executable**, same reason. |
| `question_tally(uuid)` | Returns global vote counts per option for one question | **Revoke EXECUTE from `anon` and `authenticated`.** It is only ever called server-side through the admin client, so removing direct RPC access costs nothing. |

Both retained functions already pin `search_path = public` and take a single UUID, returning only a boolean — no data leaks through them.

Note on `submit_answer`: there is **no** database function by that name. Reveal logic lives in TypeScript server functions (`answerAsRecipient` and siblings in `src/lib/remote.functions.ts`), which run under the service role. Each one resolves the caller's participant row by `(session_id, guest_token)` and throws before inserting when no row matches, so participation is verified. The plan keeps that design; the hardening step is to make the participant lookup a single shared helper so no future handler can skip it.

## 3. Reveal lock — holds

Two independent layers:

- The policy on `answers` is `SELECT USING (is_my_participant(participant_id) OR session_question_revealed(session_question_id))`. Another participant's row is unreadable while `revealed_at` is null, and there are no UPDATE or DELETE policies at all.
- More decisively: `anon` and `authenticated` currently hold **zero table grants** in the `public` schema. A direct Data API query with the publishable key cannot read `answers` — or any other table — at all. Every read reaches the client through server functions, which withhold the other side's answer until `revealed_at` is set (`answerAsRecipient` returns `sender: null` before reveal, and `loadRelationships` only fills `theirLabel` when `sq.revealed_at` is set).

No change needed here. Worth recording in security memory so a future migration does not add blanket grants and quietly hand the anon key direct table access.

## Build order

1. **Load existing invites on `/send/:sessionId`.** New server function `listSessionInvites({ sessionId, guestToken, profileId? })` returning token, label, note, sent time, and answered state. The page fetches on mount and merges with any links created in the same visit, so a reload no longer loses them.
2. **Dual-key identity.** New server-only helper `src/lib/identity.server.ts` exposing `myParticipants`, `myParticipantIn`, and `linkProfileToGuestRows`. `getInbox` and `getSenderResults` take an optional `profileId`, resolve participants by `guest_token` OR `profile_id`, and stamp `profile_id` onto the sender's existing guest participant rows when a signed-in viewer calls them.
3. **Awaiting-reply group on `/conversations`.** `listConversations` also returns pending invites — recipient label, when it was sent, and the link token — for every session where the viewer is the sender and the invite has no `completed_at`. When there is at least one, the group renders first on the page, above the people list, with a copy-link action so the sender can re-send. This closes the gap between sending and the recipient answering, which today has no surface at all.
4. **UUID-shaped guest tokens.** `src/lib/guest.ts` returns a valid UUID on every fallback path (formatting `getRandomValues` bytes as a v4 UUID, and a `Math.random`-based v4 as the last resort), so a browser with blocked storage no longer produces tokens that every `z.string().uuid()` validator rejects.
5. **Migration:** `REVOKE EXECUTE ON FUNCTION public.question_tally(uuid) FROM anon, authenticated;` — `is_my_participant` and `is_session_member` keep EXECUTE because the RLS policies call them as the querying role.
6. **Security memory:** record that `public` intentionally grants nothing to `anon`/`authenticated`, that all access is mediated by service-role server functions, and that the reveal lock is enforced both by policy and by the server functions withholding the other side's answer until `revealed_at` is set.

## Files touched

- `src/lib/identity.server.ts` (new) — dual-key participant lookup and profile backfill.
- `src/lib/remote.functions.ts` — `listSessionInvites` (new); optional `profileId` on `getInbox` and `getSenderResults`; participant lookups routed through the shared helper.
- `src/lib/conversations.functions.ts` / `conversations.server.ts` — pending-invite list alongside the people list.
- `src/routes/send.$sessionId.tsx` — load existing invites on mount.
- `src/routes/conversations.tsx` — awaiting-reply group rendered first when non-empty.
- `src/lib/guest.ts` — UUID-shaped fallback tokens.
- One migration for the `question_tally` revoke; security memory updated.

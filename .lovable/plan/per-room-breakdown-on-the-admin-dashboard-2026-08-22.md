# Per-room breakdown on the admin dashboard

Add a session-level view to `/admin` so you can pull up any room and see, question by question, how the vote split and how long each one took.

## What you'll see

**1. A room list** (new section on `/admin`, respecting the existing 7/30/90-day window)

One row per session: date and time, mode (group / in-person / remote), number of people, questions revealed, and whether it finished. Rows are clickable.

**2. A room detail view** at `/admin/s/<sessionId>`

Header: date, mode, participant names, total duration.

Then one block per question, in play order:

- The question text and both (or three) option labels
- Vote counts per option, plus a bar showing the split
- A split label: `even` (50/50 or off by one), `leaning` (roughly 2:1), or `lopsided` (3:1 or unanimous)
- Time on question — from the previous question's reveal (or room open, for Q1) to this question's reveal
- Answer window — first to last answer submitted
- Skipped questions marked as such (never revealed, no answers)

Above the list, two quick counts: how many questions landed even and how many landed lopsided.

Sorted in play order by default, with a toggle to sort by closeness so the near-50/50 ones come to the top.

## Technical notes

- New read function in `src/lib/admin.server.ts`: `readSessions(admin, windowDays)` and `readSessionDetail(admin, sessionId)`. `readSessionDetail` joins `session_questions` → `questions` → `answers`, groups by `option_key`, and derives timings from `sessions.created_at`, each `session_questions.revealed_at`, and answer `created_at` values.
- Two new server functions in `src/lib/admin.functions.ts` (`getAdminSessions`, `getAdminSessionDetail`), both reusing the existing `requireSupabaseAuth` + `ADMIN_EMAILS` gate and the admin client, exactly like `getAdminMetrics`.
- New route `src/routes/admin.s.$sessionId.tsx` (`noindex`), plus a room-list section added to `src/routes/admin.tsx` linking to it.
- Impression questions store two rows per person (`answer_role`), so the detail view splits those into "guess about the other" and "about self" counts rather than summing them into one misleading total.
- Read-only: no schema changes, no migrations, nothing written.

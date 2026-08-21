# Complete CSV snapshot of live data

Export every table in the live backend to CSV files you can download.

## Tables exported

All 20 public tables, one CSV each with a header row and full columns:

`answers`, `connections`, `email_optouts`, `events`, `host_requests`, `invites`, `notifications`, `participant_emails`, `profiles`, `questions`, `reason_chips`, `session_links`, `session_participant_topics`, `session_participants`, `session_question_votes`, `session_questions`, `sessions`, `thread_messages`, `thread_reads`, `topics`

Written to `/mnt/documents/nosure-backup/`, plus a short `manifest.csv` listing each table and its row count so you can confirm nothing was truncated.

## Notes

- Read-only: nothing in the database or the app changes.
- Point-in-time snapshot, not a live sync — re-run any time for a fresh copy.
- `participant_emails`, `profiles`, `session_links`, and `email_optouts` contain personal data and access tokens; keep the export private.

# CSV backup of live data

Export four tables from the live backend to CSV files you can download.

## What gets exported

- `sessions` (72 rows)
- `invites` (24 rows)
- `answers` (262 rows)
- `thread_messages` (52 rows)

Each table becomes one CSV with a header row, full columns, written to `/mnt/documents/nosure-backup/`.

## Notes

- Read-only: nothing in the database or the app changes.
- These are point-in-time snapshots, not a live sync — re-run any time for a fresh copy.
- I can add other tables (for example `session_participants`, `notifications`, `participant_emails`) to the same export if you want a fuller backup.

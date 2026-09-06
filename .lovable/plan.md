# Evidence pass: what an outsider can actually reach

All of the below was run just now against the live database — the first block using only the public key that ships in the browser.

## 1. Reading another person's row with the public key

Picked a real participant (`3466385e…a43d`) and asked for it directly:

```text
GET /rest/v1/session_participants?select=id,guest_token&id=eq.3466385e-…
{"code":"42501","message":"permission denied for table session_participants"}
```

Not "row hidden", not "token null" — the table itself is refused before any row or column is considered. Same result, same error code, for `session_participants` (all columns), `invites.token`, `session_links.token`, `participant_emails.email`, `person_notes.note/contact`, `profiles.email`, `answers`, and `sessions.room_code`. Ten out of ten refused.

## 2. Grants on every table in public

```text
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated');
(0 rows)
```

Zero, across all 20 tables, for both roles. Column-level grants: also zero. Default privileges for new tables created by `postgres` no longer include either role.

One gap found: the `supabase_admin` default-privilege entry still lists `anon` and `authenticated` for tables, so a table created by that role (rather than by migrations) would arrive pre-granted.

## 3. Functions still callable by anon or authenticated

Eight SECURITY DEFINER functions are still reachable, and this is a real hole, not a theoretical one. Live call with the public key:

```text
POST /rest/v1/rpc/admin_impression_questions
[{"text":"You're better at","guesses":2,"mismatches":2,"mismatchRate":100}, …]
```

Admin analytics returned to an anonymous caller. `profile_data`, `profile_participants`, `profile_id_for_handle` and `draw_questions` also answer.

Cause: the earlier hardening revoked EXECUTE from `anon` and `authenticated`, but function EXECUTE is granted to `PUBLIC` by default, and `anon` inherits it that way. The catalog shows it plainly — `admin_impression_questions` has `{=X/postgres, postgres=X, service_role=X}`, where the leading `=X` is the PUBLIC grant.

| Function | Verdict |
| --- | --- |
| `is_my_participant`, `is_session_member` | **Keep callable.** RLS policies on answers, sessions, notifications and others call them as the querying role; revoking breaks the policies themselves. Both return only a boolean. |
| `current_guest_token`, `session_question_revealed` | **Keep callable.** Same reason; not SECURITY DEFINER, no data returned. |
| `admin_impression_questions`, `admin_impression_exhaustion` | **Revoke from PUBLIC.** Admin-only analytics, currently readable by anyone. |
| `profile_data`, `profile_participants`, `profile_id_for_handle` | **Revoke from PUBLIC.** Only ever called through server code with the service role. |
| `draw_questions` | **Revoke from PUBLIC.** Accepts guest tokens as arguments; server-only. |

The other seventeen definer functions (`admin_*`, `room_state`, `people_overview`, `relationships_detail`, `question_tally`, `selection_*`) are already service-role only — verified per function, not assumed.

## 4. Were any tokens exposed? No rotation needed

- Grants: the only GRANT statements in the entire migration history touching credential tables are `GRANT ALL … TO service_role` (session_links, person_notes). `anon`/`authenticated` never held a grant, so PostgREST never served a row from those tables.
- Functions: none of the eight anon-reachable functions returns a guest token, invite token, session-link token or email address — they return booleans, question ids, and impression aggregates. Checked each return shape.
- App code: the one place a guest token crosses the wire is `/s/{token}` restoring your own identity from your own saved link, which is the link's whole purpose. The public diagnostic endpoint is behind an HMAC of a server secret.

Conclusion: no evidence of exposure, and no mechanism by which it could have happened. Rotating 165 guest tokens would sign every guest out of their history for no security gain — recommend not rotating.

## 5. Full credential-column sweep

Every column that acts as a credential or personal data, and every policy that could reach it:

| Column | Reachable? |
| --- | --- |
| `session_participants.guest_token` | No table grant, and no SELECT policy since the last change. |
| `invites.token` | No grant, no policy. |
| `session_links.token` | No grant, no policy — never had one. |
| `participant_emails.email` | No grant, no policy. |
| `person_notes.*` (nickname, contact, note) | No grant, no policy. |
| `profiles.email` | No grant; policy is `id = auth.uid()` and unusable without a grant. |
| `sessions.room_code` | No grant; member-only policy. |
| `answers`, `thread_messages` (pre-reveal) | No grant; policy also requires own row or revealed. |

No credential column is reachable through any policy on any table.

# What I propose changing

One migration, no app-code changes:

1. `REVOKE EXECUTE … FROM PUBLIC` (plus anon, authenticated) on the six server-only functions: `admin_impression_questions`, `admin_impression_exhaustion`, `profile_data`, `profile_participants`, `profile_id_for_handle`, `draw_questions`; re-grant to `service_role`.
2. Sweep the same PUBLIC revoke across every other function in `public` except the four that RLS policies must call, so no already-revoked function is silently reachable via PUBLIC.
3. `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated`, so future functions are locked on creation rather than after the fact.
4. Re-run the same live public-key probe afterwards and paste the before/after output.

Risk check: all six functions are called through the service-role client in `profile.functions.ts`, `admin.functions.ts` and `selection.server.ts`, which bypasses these grants, so `/me`, `/p/:handle`, `/admin` and question drawing are unaffected. I will verify each of those pages loads after the migration.

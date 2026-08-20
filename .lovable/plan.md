# Fix and verify Resend email sending

## What I found (already verified by reading the code)

- There is exactly **one** place in the whole codebase that sends email: `src/lib/email.server.ts` → `sendReplyEmail()`. It POSTs to `https://api.resend.com/emails`.
- It is called from **one** place: `src/lib/notify.server.ts` → `notifyThreadReply()`, which runs when someone posts a thread message (server-side only).
- The current `from` address is `NoSure <replies@nosure.app>` — **not** `onboarding@resend.dev`. There is no default Resend sender anywhere.
- The API key is read server-side only, as `process.env["RESEND_API_KEY"]`, inside a `.server.ts` file that never reaches the browser bundle. No key in frontend code.
- `RESEND_API_KEY` exists as a project secret (value encrypted, not readable).
- There are **no Supabase Edge Functions** in this project — email runs in the app's server runtime, so it deploys with the app; nothing separate to redeploy.
- Silent-failure risks in the current code: if the key is missing it returns `{ sent: false, reason: "no_api_key" }` and nothing is logged; on success the Resend message ID is discarded, so nothing is traceable in Resend Logs.

## Changes

1. **Sender address** — change `FROM` in `src/lib/email.server.ts` to `NoSure <hello@nosure.app>` (verified domain `nosure.app`).
2. **Traceability** — capture the Resend response body on success, log the returned message `id`, and return it from `sendReplyEmail`. On failure, log status + full body (already partly done) and return the body text.
3. **Missing-key visibility** — log an explicit error when `RESEND_API_KEY` is absent instead of failing silently.
4. **Test/diagnostics endpoint** — add `src/lib/email.functions.ts` with a `sendTestEmail` server function that:
   - reports whether `RESEND_API_KEY` is present in the server env (boolean + key length only, never the value);
   - sends a real email from `NoSure <hello@nosure.app>` to an address I pass in;
   - returns the exact HTTP status code, the raw Resend response body, and the message `id` if present.
   It requires a matching `EMAIL_UNSUBSCRIBE_SECRET`-derived token so it is not a public send endpoint.

## Verification I will run and report back

- Invoke `sendTestEmail` against the live server runtime and paste back verbatim:
  - the responsible function and file,
  - the exact `from` address used,
  - whether `RESEND_API_KEY` was available,
  - the HTTP status code,
  - the exact Resend response body (including the email `id` for Resend Logs, or the exact error message).
- If Resend returns 200 with an `id` but nothing arrives, I'll give you that id to look up in Resend Logs and read the delivery status there.

Test recipient: **vivcao17@gmail.com**.

## Note

`hello@nosure.app` must exist as a sender on the verified `nosure.app` domain in Resend; Resend does not require the mailbox to exist, only the domain to be verified, so this should send fine.

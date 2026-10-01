# Narrow NoSure to Impression Cards

## Visible experience
- Keep You and People in the bottom bar. Make the signed-out home and You page lead into the five-question impression card; keep the example impression page. Hide all 1:1, meetup, weekly-chain, pack-picker, report, and preview-example entry points from navigation without deleting their pages or underlying code.
- Make People a list of existing 1:1 conversations only. Remove guesser-only entries from its read path and clean up test-only guesser records if any exist.

## Complete the card flow
- Give friends their per-question right/wrong results immediately after guessing, without signing in. Offer sign-in to make their own card, not to see results.
- On You, show the share link and share/copy controls. With guesses, show results directly: a per-question view for one or two friends and a compact tappable grid for three or more. Add the most-missed question. Do not add authored tags or prepared follow-up text.
- Replace the unbalanced apology question for new cards without rewriting answered questions. Preserve old cards' original five questions.

## Weekly and data integrity
- Add a globally scheduled Monday question set editable in admin. Show the weekly question and a forwardable guess link on You, with an optional one-tap third question.
- Store repeated guesses and changed self-answers as timestamped new rows; read the newest. Keep past records intact.

## Technical details
- Reuse existing card/session/question structures and guest-token identity. Keep impression data behind server-side access checks, with no direct public table read.
- Store weekly configuration behind protected server functions. Existing routes remain registered and reachable by direct URL. Do not use option tags or prompt taps.
- Verify the signed-in owner and no-session guest journeys, then check the app for errors.

No matching, compatibility, ranking, AI descriptions, generated or authored tags, prepared follow-up text, free-text guessing, or radar charts.

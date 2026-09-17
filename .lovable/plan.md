# Chain

A third mode alongside 1:1 and group. One question per week, passed friend to friend, each hop a mutual guess with a simultaneous reveal.

## First: the guess-accuracy check you asked for

There isn't enough real data to answer it yet. Across all non-test sessions there are 23 reads about other people, and only 2 of them can be compared against that person's own answer on the same question (the other reads have no matching self-answer on file). Those 2 rows sit on one question — "You apologize: too much / not enough" — and split 1 right, 1 wrong.

So the existing 8-question pool cannot be scored, and the "4 of 5 guessed correctly" figure was too small to act on. Rather than swap the old pool blind, Chain ships with its own 20-question bank (the list you supplied), and accuracy per question becomes a tracked number from week one — the first real signal for cutting questions.

## The weekly cycle

A schedule table holds one question per week with an opening time (Thursday evening) and a settling time (Sunday evening), pre-filled for 20 weeks from the supplied bank in order. Every hop in a week uses that week's question — never a fresh draw.

Home gets a permanent entry beside Start:

```text
This week's read
One question · Guess a friend · 30 seconds
```

Present in every state. When no week is open it shows last week's result and links to the settlement page.

## The flow

Starting (A), at `/chain`:
1. The question, answered for themselves.
2. Type a friend's name — required, free text, nicknames fine.
3. The question re-renders with that name inside it; one tap is the guess.
4. A link to send, with copy button and share text.

Receiving (B), at `/c/:token`:
1. Question shown. None of A's answers visible.
2. "Which one is Amy?" — B guesses A first.
3. B answers for themselves.
4. B names someone and guesses them — pass-on, before the reveal, quiet skip control, never gating.
5. Reveal, all four at once:

```text
Amy guessed you    louder     — You said    quieter    ✗
You guessed Amy    quieter    — Amy said    quieter    ✓

You read her. She didn't read you.
```

6. The one bridge at the bottom: "Want to know Tim better? [ Three questions → ]", starting a normal 1:1 three-question invite with the person B just named — independent of the chain.

Whatever name was typed is what the recipient sees on the link preview and landing page ("Amy guessed you").

## Sunday settlement

At `/chain/week`, two blocks, no counts anywhere:

- **What happened** — one line per event, phrased like messages: "Ben guessed you jump in. He was right."
- **This week's gap** — computed from the week's rows: the self-answer split against the guess-about-others split, stated plainly, plus optionally the week's hardest-to-guess question.

Never displayed: chain length, node counts, trees, how many guessed you, how many played, who didn't pass on, any ranking.

Distribution thresholds: there is no school field in this product today, so the school tier is inactive and the page falls back to the friend-circle split ("3 of your friends picked A"), and shows nothing when that circle is too small to be legible. Adding a school field later turns the first tier on without other changes.

## What gets built

New:
- `chain_questions` (the 20-question bank) and `chain_weeks` (question per week, opens/settles times).
- `chain_guesses`: guesser identity, guesser name, subject name, subject identity once known, week, guessed option, subject's actual option, matched, link token, created_at. No chain relationships, no depth, no tree.
- Server functions: current week, start a chain, open a link, submit guess/self-answer, pass on, reveal, settlement (personal lines + global gap in two queries).
- Routes `/chain`, `/c/$token`, `/chain/week`, plus the permanent home entry.

Reused as-is: link generation and tokens, signed-link identity recovery, guest-token identity, the reveal lock, OG preview cards, and the existing 1:1 invite flow behind the reveal-screen bridge.

## Instrumentation

Events for: chain started, link opened, guess submitted, self answer submitted, pass-on generated, pass-on skipped, reveal shown, bridge tapped, bridge completed, settlement share tapped. From these: pass-on rate, next-hop open rate, completion rate, chain → three-question conversion, per-question guess accuracy, share taps.

## Technical notes

- Tables are service-role only, consistent with the rest of the backend — no anon or authenticated grants; all reads go through server functions.
- Link tokens are opaque and single-purpose, following the existing invite-token pattern; a token identifies one guess row.
- Reveal is decided server-side from stored answers, never inferred client-side.
- Chain sessions created by the owner's excluded identities are marked as test data the same way existing sessions are.
- Chain questions live in their own table so the existing impression pool, draw logic, and profile wall are untouched.

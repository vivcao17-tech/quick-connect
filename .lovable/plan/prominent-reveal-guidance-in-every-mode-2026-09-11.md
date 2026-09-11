# Prominent reveal guidance in every mode

## What will change

- Add a shared reveal-guidance pattern directly beneath the visible answers, styled at the same prominence as the next action.
- Use the actual participant names in every prompt.
- Apply the pattern to remote 1:1, in-person 1:1, in-person group, and remote async group reveals.
- Simplify remote reveals so the person has one clear choice: open the conversation or move on.

## Wording rules

- **1:1, different answers:** “You and {name} went different ways. Ask {name} why.”
- **1:1, same answer:** “You and {name} picked the same. Same answer — same reason?”
- **Group, one or two people in the minority:**
  - Everyone else sees: “Only {names} picked that. Ask {names} why.”
  - A named minority participant sees: “You're the only one. *Last time this happened…*” or the equivalent for two named people.
- **Group, close to even:** show both side counts and invite both sides to speak, for example “Three and three. Each side, say why — then see if anyone switches.”
- **Group, unanimous:** “All of you. Next.”
- Impression reveals use the same match/difference principle in 1:1, and the same viewer-safe group rule where multiple reads are shown.

## Placement and interaction

- Put the guidance immediately after the answer comparison or distribution, before follow-ups, threads, and navigation.
- In-person guidance is a large, high-contrast static block. Remote guidance is tappable and opens that question's thread composer with the line pre-filled for editing or sending.
- Keep the guidance visually balanced with “Next question,” while inviting conversation without forcing anyone to explain or defend.
- In async group results, include the guidance inside each question result and repeat it in the opened discussion view, where there is no sequential Next button.
- Never show async-group split guidance until the server-side reveal has fired.

## Remote reveal simplification

- Reduce remote 1:1 and async-group discussion views to the visible answers plus three choices:
  1. One tappable opening line that combines the generated observation with the split guidance and pre-fills the composer.
  2. One fallback quick chip beneath it.
  3. One separated 👀 reaction under a small “no reply needed” label.
- Remove the follow-up question from the reveal decision screen. Show it only after the person opens the thread.
- Remove competing observations, extra prompt chips, and reaction choices from the initial remote reveal.
- Keep the composer available as the single place to edit and send the suggested line.

## Technical details

- Create one shared formatter/component for split detection, name formatting, viewer-minority handling, ties, unanimity, 1:1 wording, and static-versus-tappable mode.
- Reuse the answer/name data already returned by each mode; extend a return shape only if a mode lacks the viewer’s real name or complete split membership.
- Ensure two-option and any three-option questions degrade safely when answers are missing.
- Extend the thread interface to accept pre-filled text and reveal its composer on demand, without sending automatically.
- Keep split guidance server-gated by `revealed_at`; never infer a final group split from partial answers.
- Verify unanimous, even, minority-viewer, majority-viewer, and 1:1 same/different states in both static and tappable variants on mobile and desktop.

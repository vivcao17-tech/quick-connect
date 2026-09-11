# Prominent reveal guidance in every mode

## What will change

- Add a shared reveal-guidance pattern directly beneath the visible answers, styled at the same prominence as the next action.
- Use the actual participant names in every prompt.
- Apply the pattern to remote 1:1, in-person 1:1, in-person group, and remote async group reveals.

## Wording rules

- **1:1, different answers:** “You and {name} went different ways. Ask {name} why.”
- **1:1, same answer:** “You and {name} picked the same. Same answer — same reason?”
- **Group, one or two people in the minority:**
  - Everyone else sees: “Only {names} picked that. Ask {names} why.”
  - A named minority participant sees the same factual first sentence followed by a gentle scaffold such as “Last time this happened…”
- **Group, close to even:** show both side counts and invite both sides to speak, for example “Three and three. Each side, say why — then see if anyone switches.”
- **Group, unanimous:** “All of you. Next.”
- Impression reveals use the same match/difference principle in 1:1, and the same viewer-safe group rule where multiple reads are shown.

## Placement and interaction

- Put the guidance immediately after the answer comparison or distribution, before follow-ups, threads, and navigation.
- Render it as a large, high-contrast outlined action block so it is unmistakable and visually balanced with “Next question.”
- Keep existing follow-up and discussion controls working; the guidance invites conversation without forcing anyone to explain or defend.
- In async group results, include the guidance inside each question result and repeat it in the opened discussion view, where there is no sequential Next button.

## Technical details

- Create one shared formatter/component for split detection, name formatting, viewer-minority handling, ties, unanimity, and 1:1 wording.
- Reuse the answer/name data already returned by each mode; extend a return shape only if a mode lacks the viewer’s real name or complete split membership.
- Ensure two-option and any three-option questions degrade safely when answers are missing.
- Verify representative unanimous, even, minority-viewer, majority-viewer, and 1:1 same/different states on mobile and desktop.

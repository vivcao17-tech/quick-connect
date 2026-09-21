# Refine pair packs and the starter round

## What will change

- Replace locked-pack question totals with round language everywhere pack progress appears:
  - 1 round: “One more round to unlock”
  - 2 rounds: “Two more rounds to unlock”
  - 3+ rounds: “A few more rounds to unlock”
  - Locked Clash, until another pack is unlocked: “Opens after you unlock another one”
  - Unlocked packs show no counts.
- Count only revealed A/B questions toward pack progress. Impression reads never count. Calculate rounds as `ceil((threshold - answered) / 2)`.
- Update the pair pack picker title and descriptions. Rename the starter option to “A bit of everything” with “Two easy ones and one guess about each other.”
- Show the starter option only when the pair has no prior shared play. Otherwise, move the first locked pack by display order to the top and mark it “Next up.”
- Preserve direct links from a pair’s shared page by carrying that person context into the remote picker. A generic send flow, where the recipient is not known yet, will continue to offer “A bit of everything.”

## Starter-round selection

- Build a random pool of up to six active A/B questions that are either featured or tagged as an icebreaker/divider.
- Exclude questions already answered by the person making that pick, rather than excluding everything either person has seen.
- Require exactly two selections and replace the picker copy with “Pick two.”
- Add exactly one active impression question tagged for the starter round, keeping every starter round at three questions.
- In person, keep one pick per player; if both choose the same question, fill the second A/B slot server-side so the round still contributes two distinct pack questions.

## One-time featured-question tagging

Apply a conservative data update only where the existing wording clearly fits:

- **Click:** “Worse night out”; “More annoying?”; “A friend cancels because they just don't feel like going”; “Your friend refuses to tell you the plan”; “You have one free day in a new city”; “You spot someone you know across the street and they haven't seen you.”
- **Bring out:** “A friend tells you something embarrassing they did. First instinct”; “You'd rather have a friend who”; “You'd rather be.”
- **Clash:** “Your friend is excited about something you think is overrated”; “A group photo where you look bad and everyone else looks great”; “Bigger betrayal?”; “You and a friend want totally different things from a trip”; “Worse friend?”; “Your friend thinks you're making a bad decision.”
- **Leave empty:** “Going back to where you grew up feels”; “The last slice, and nobody's claiming it”; “Someone says ‘we should hang out sometime’”; “Home is”; “Someone remembers a tiny detail you mentioned weeks ago.”
- No featured question clearly belongs in **Talk**, so none will be forced into it.

The update will not change question wording, featured status, topic tags, existing answers, or existing sessions.

## Technical details

- Centralize pair-history, pack-order, and progress rules in the existing pack server layer so remote and in-person screens use the same result.
- Add pair identity to remote picker links and inputs only where a known person exists.
- Keep the fallback behavior for exhausted pack pools, but do not expose any bank-size totals.
- Scope all selection and display changes to `remote` and `irl_pair`; Chain, group, and async-group paths remain untouched.

## Verification

- Check new-pair and returning-pair picker ordering and labels.
- Check starter pools contain at most six eligible unseen choices, accept exactly two, and end with one starter impression read.
- Check pack rounds contribute two A/B questions even when in-person picks collide.
- Check locked, Clash-gated, and unlocked pack cards on the shared person page.
- Run focused type/tests and exercise remote and in-person pair flows in the browser; confirm Chain and group entry paths are unchanged.
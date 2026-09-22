# Dynamic share cards and one-question reconnects

## Goal
Every private round invite, Chain link, and public wall link produces a rich server-rendered link preview. People who have not played together for 30 days get a direct one-question way to reconnect from “You & them.”

## Build

### Private round invite cards (`/i/:token`)
- Expand the existing read-only preview lookup to return the sender’s first name and the round’s impression question prompt plus its two options.
- Keep preview lookup separate from opening the invite so a messaging crawler cannot mark a link opened or change any session state.
- Render these tags in the initial server HTML:
  - title: “{name} has one question for you”
  - description: the impression question
  - image: a 1200×630 NoSure card with that title, prompt, and both options
- Never read or render the sender’s selected option, recipient answer, reason, or result.

### Chain cards (`/c/:token`)
- Add a read-only Chain preview lookup for sender first name, the week’s prompt, and both options.
- Use it in the route loader so the personalized title, description, and image URL are present before JavaScript runs.
- Generate the same 1200×630 question-card format, without the stored guess, reason, answer, match, or result.

### Public wall cards (`/p/:handle`)
- Keep the existing server-loaded public profile name and change its preview to:
  - title/image heading: “{name}’s wall”
  - image line: “See how people guess {name} — then guess them yourself.”
- Do not include any wall read, option, answer, count, or result in metadata or the image.
- Treat the wall as the current “guess me” link; do not add another feature.

### Image delivery
- Add public image endpoints that return 1200×630 PNG responses generated on demand in NoSure’s cream, rust, green, and ink palette.
- Use an Edge-compatible renderer with embedded styling and safe text wrapping.
- Set `og:image`, `twitter:image`, dimensions, MIME type, canonical/`og:url`, and large-image Twitter metadata to absolute `https://nosure.app` URLs.
- Return conservative generic cards for invalid links and cache successful images without exposing secrets.

### “It’s been a while” one-question round
- On both `/people` rows and `/with/:person`, show “It’s been a while. One question?” only when the pair has a prior session and their latest shared activity is at least 30 days old.
- Tapping starts a focused one-question screen for that person. The server selects one active pair A/B question that neither person has answered, using existing identity matching and question-selection rules.
- After the sender answers, create a separate one-question remote session and private `/i/:token` invite, then open the native share sheet. Fall back to copying the message and link when native sharing is unavailable.
- The resulting `/i/` page uses the singular one-question copy and normal answer/reveal/thread behavior.

## Technical details
- Add new server functions rather than weakening the existing three-question round validator.
- Keep all data reads and writes behind the existing service-role server-function boundary.
- Preserve the existing session, participant, question snapshot, answer, invite, and test-session exclusion structures; no schema change is expected.
- Use both people’s known guest/profile identifiers for the mutually-unanswered draw, with the existing legacy fallback only when the unseen pool is exhausted.
- Do not change Chain gameplay, in-person pair gameplay, or any group mode.

## Verification
- Fetch `/i/:token`, `/c/:token`, and `/p/:handle` as plain HTML and confirm complete metadata exists without browser JavaScript.
- Fetch each image endpoint and confirm a valid 1200×630 PNG with no answer data.
- Test first-name handling, long prompt wrapping, invalid links, and existing three-question invites.
- Test the 30-day threshold on `/people` and `/with/:person`, complete the one-question sender step, verify native-share fallback, open the recipient link, answer, reveal, and reopen the shared thread.

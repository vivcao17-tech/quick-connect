# Signed-in app shell and People inbox

## Scope

Build only the signed-in four-tab shell and the People list. Keep every existing conversation, thread, `/with/:id`, reveal, Chain gameplay, and group flow unchanged. Existing URLs continue to work.

## App shell

- Add a shared bottom tab bar on the signed-in app destinations only:
  - **People** → `/people`
  - **Meet** → `/meet`
  - **You** → `/me`
  - **This week** → `/chain`
- Use TanStack links so switching tabs stays client-side without a full-page reload.
- Fix the bar to the bottom, include device safe-area spacing, provide clear active states, and reserve page-bottom space so content is never covered.
- Add `/meet` with exactly: “Meetups are coming. Check back soon.”
- Show a red dot on **This week** while the current weekly question is open and the signed-in person has not answered it. Reuse the existing Chain week read; do not change Chain behavior.
- On `/`, wait for the existing session check: signed-in people go to `/people` with history replacement; signed-out people keep the current landing page unchanged and see no tab bar.
- Never show the tab bar on invite/share links, room/setup flows, public walls, auth, admin, legal pages, conversations, threads, or `/with/:id` pages. A signed-out person opening an invite still sees only the current invite experience.

## People tab

- Replace the current directory-style rows with a conversation list sorted by latest activity.
- Each person row includes:
  - a stable circular initial avatar whose color is derived from the name using the existing brand palette;
  - the displayed name;
  - a red dot when that person has unread activity;
  - one concise status line chosen from existing pair data.
- Compute status safely from the existing relationship detail and pack rules, with this priority:
  1. unread revealed mismatch with a reason → “Guessed you wrong on … — see why”;
  2. questions answered by them but still waiting on the viewer → “Waiting on you · …”;
  3. a currently unlocked pack → “[Pack] unlocked”;
  4. otherwise a neutral latest-activity or waiting status.
- Never include either person’s option in a list status before both answers exist. Statuses only describe state; existing reveal rules remain authoritative.
- Keep each person row linked to the existing `/with/:id` page; do not change that page.
- Add a small person-plus action at top right that starts the existing new-person remote invite flow.
- Add a prominent floating plus action at bottom right. It opens a person picker over the People page:
  - first row: “Someone new →”;
  - remaining rows: existing people, most recent first;
  - selecting an existing person opens the current pair-aware pack picker via `/remote?person=…`;
  - selecting someone new opens the current new-person remote flow.
- For an empty account, show one short explanatory line and make the floating plus the dominant action; do not render an empty list shell.

## Existing test data

- Add a one-time migration that marks every existing session as test and records every existing participant identity—signed-in profiles and guest devices—as test.
- Preserve all rows; do not migrate old conversations into a new structure and do not delete questions, answers, sessions, or people.
- Keep the existing automatic test propagation for future rooms involving a flagged identity.

## Technical details

- Reuse `relationships_detail` for one list-level read, then derive row status and pack unlocks server-side with bulk question metadata rather than issuing one request per person.
- Keep all private reads behind the existing service-role server-function boundary.
- Add only the small shared tab-bar/picker presentation needed for these routes; do not reorganize unrelated route files.
- Preserve the current signed-out landing page and all public metadata.

## Verification

- Verify signed-in `/` opens `/people`, while signed-out `/` remains the current landing page.
- Verify all four tabs switch without document reload, remain clear on mobile safe areas, and do not cover content.
- Verify no tab bar appears on signed-out invite links or any excluded flow.
- Verify People ordering, stable avatar colors, unread dots, each status type, person links, both plus actions, person picker ordering, and empty state.
- Verify unrevealed choices never appear in People responses or UI.
- Confirm all pre-existing sessions and participant identities are test-marked.
- Run the project typecheck and a focused desktop/mobile browser pass without changing the deferred pages or gameplay.
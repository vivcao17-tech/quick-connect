# Roadmap

## Speed up profile wall

- [x] Trace browser and database round trips before changing the wall
- [x] Consolidate wall reads into one phased Postgres function
- [x] Render impression cards before prompts and owner-only counts
- [x] Verify first-card render under 500 ms and one database call per phase

## Speed up topic → first question

- [ ] `draw_questions` Postgres function: exclusion, tiers, topic spread, positional spice in one round trip
- [ ] Return per-person answer count per question so admin needs no extra query
- [ ] First question renders on selection; later questions drawn in the background
- [ ] Indexes: `answers(participant_id)`, `session_questions(question_id)`; drop duplicate `answers_sq_idx`
- [ ] Fold `getRoomState`'s 9 calls into one `room_state` function
- [ ] Verify end to end under 500 ms

## Reveal guidance and remote reveal simplification

- [x] Add shared split-aware, name-aware guidance across all four modes
- [x] Make in-person guidance static and remote guidance open a prefilled composer
- [x] Reduce remote reveals to one opening line, one fallback chip, and one 👀 reaction
- [x] Move remote follow-up questions inside the opened thread
- [x] Verify unanimous, even, minority-viewer, majority-viewer, and 1:1 states on mobile and desktop
- [x] Replace narrated remote reveal guidance with the inline “Because” first-message composer

## Profile wall display rules

- [x] Restore `/me` navigation for signed-in owners after unread reads are cleared
- [x] Apply uncurated mismatch-first top-four display (agreements stay, labeled "they got this one right") and curated exact-selection rules
- [x] Add owner-only undisplayed-new-reads nudge
- [x] Show all owner impression cards with explicit wall visibility and summary counts
- [x] Trim visible self-authored prompts to three with “More about me”
- [x] Give saved self-authored prompts explicit wall visibility controls and summary counts
- [x] Verify owner and public wall behavior

## Permanent wall entry

- [x] Home profile entry link always present and always navigates to `/me`; state only changes dot/teaser copy
- [x] Save principle to memory: wall reachability never depends on state

## Group friend history by topic

- [x] Return each question’s stored topic ID and label in the existing relationship detail
- [x] Group and deduplicate friend-history questions by topic, sorted by latest activity
- [x] Link every question row to its existing thread
- [x] Verify desktop and mobile friend-detail layouts and thread navigation

## Chain (weekly passed question)

- [x] Chain schema: question bank, weekly schedule, self-answers, guesses with optional reason
- [x] Server functions: current week, start, open link, guess, self-answer, pass on, reveal, settlement
- [x] Routes /chain, /c/$token, /chain/week and the permanent home entry
- [x] Optional "because" line on every guess, shown under the guess on reveal
- [x] Repeat guesses in one week accumulate as lines, never re-ask the self-answer
- [x] Reveal-screen bridge into a normal 1:1 three-question invite
- [x] Instrumentation events and verification on mobile and desktop

## Packs (1:1 rounds grouped into four packs)

- [x] Question columns, `pack_config`, and the v2 pack question bank
- [x] Pack + question selection in the remote 1:1 flow
- [x] Pack and question selection screens in the in-person pair room
- [x] Pack preview and unlock thresholds on the shared page
- [x] Next-pack bridge from the reveal pages
- [x] Verify the remote pack flow end to end on mobile
- [x] Replace pack question totals with round-to-unlock language and exclude impression reads from progress

## Share cards and one-question reconnects

- [x] Add server-rendered dynamic preview metadata and 1200×630 images for private round invites and Chain links
- [x] Add invitation-only preview metadata and images for public wall links, without specific reads or answers
- [x] Replace `{name}` in private round preview prompts with that recipient's first name
- [x] Confirm the production custom domain before emitting absolute preview-image URLs
- [ ] Deferred: show the 30-day reconnect prompt and create/share a mutually unanswered one-question round
- [x] Verify preview HTML and generated images for round, Chain, and public-wall links
- [x] Make the pair-aware picker prioritize the next locked pack and limit the starter option to new pairs
- [x] Randomize the six-question starter pool, enforce exactly two A/B picks, and keep one starter impression read
- [x] Conservatively tag clearly fitting featured questions without changing their wording, featured status, or topics
- [x] Verify remote and in-person pair flows without changing Chain or group modes

## Signed-in app shell and People inbox

- [x] Signed-in root opens People; signed-out root keeps the landing page
- [x] Bottom tabs in order: People / This week / You / Meet
- [x] This week dot shows only while the open question is unanswered
- [x] People rows, statuses, invite action, floating person picker, and empty state
- [x] Mark all existing sessions and participant identities as test
- [x] Verify tab exclusions, navigation, privacy, mobile and desktop

## Signed-out entry and Berkeley meetup

- [ ] Simplify the signed-out home and add the Meet sign-in handoff
- [ ] Make Google the primary sign-in option, move room-code entry to sign-in, and preserve guest linking
- [ ] Replace the Meet placeholder with the exact 17-question paper form in matching order
- [ ] Check the eight missing questions for semantic near-duplicates; reuse and reword matches, create only genuinely new keyed rows, and report both groups
- [ ] Save questions 1–10 as normal answers and questions 11–17 only on the signup record
- [ ] Add editable meetup time-slot settings and signup/contact tools under `/admin/meet`
- [ ] Add contact-free plain-text signup export with “FirstName #ID”, readable A/B answers, open answers, and availability
- [ ] Do not build or scaffold grouping, scoring, compatibility, or matching logic; matching stays outside the app
- [ ] Verify signed-out, signed-in, signup, completion, and admin flows

## Meetup intro and deadline

- [x] Add the Sunday meetup intro before the form
- [x] Add an editable Friday 5 PM Pacific signup deadline
- [x] Replace the form with email capture after the deadline
- [x] Split signup into four retained-answer steps and remove pack labels

## Meetup thank-you screen

- [x] After submitting, thank them and say we will let them know when the matching result is out
- [x] Add an Explore button that opens the page where three questions are easiest to start
- [x] Verify the button works both signed in and signed out
- [x] Add the "Know someone who'd wanna come? Send them to nosure.app/meet" share line

## You tab entry cards and example pages

- [x] Add the two entry cards (friends-read-you card, answer-with-someone card) to the You tab
- [x] Add a "See an example →" text link under each entry card
- [x] Build read-only /example/impressions with sample-data split bars and the most-missed line
- [x] Build read-only /example/preview with sample-data side-by-side rows and summary lines
- [x] Keep sample content in one data file; charts in CSS/SVG, light and dark, phone-readable
- [x] Leave room below both pages for a multi-axis chart, not settled yet
- [x] Verify both pages signed out at phone width


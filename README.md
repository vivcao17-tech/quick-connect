# Quick Connect

1. Data Model

These constraints must not be changed — they determine whether the product can later expand to group sessions and voice notes:

A single question must support N participants, not two hardcoded user IDs

Answers are never overwritten — re-answering inserts a new row

Visibility is a field, not hardcoded logic

The answers table must have an attachment reference field (unused for now)

sql

-- Users
profiles (
  id uuid pk references auth.users,
  display_name text,
  email text,
  created_at timestamptz default now()
)

-- Topics (the words in the topic cloud)
topics (
  id uuid pk,
  slug text unique,
  label text,
  sort_order int,
  active bool default true
)

-- Questions
questions (
  id uuid pk,
  topic_id uuid references topics,
  text text,
  option_a text,
  option_b text,
  option_c text,                -- nullable, supports 3-way questions
  spice_level int default 2,    -- 1 = light, 2 = medium, 3 = spicy
  active bool default true,
  created_at timestamptz default now()
)

-- Preset reason tags (for people who don't want to type)
reason_chips (
  id uuid pk,
  question_id uuid references questions,
  option_key text,              -- 'a' | 'b' | 'c'
  text text
)

-- A session
sessions (
  id uuid pk,
  kind text,                    -- 'irl_pair' | 'remote'
  room_code text unique,        -- irl_pair only, 4 uppercase letters
  host_profile_id uuid references profiles,
  status text,                  -- see state machine
  spice_max int default 2,
  current_index int default 0,
  created_at timestamptz default now(),
  ended_at timestamptz
)

-- Participants (supports unregistered guests)
session_participants (
  id uuid pk,
  session_id uuid references sessions,
  profile_id uuid references profiles,   -- nullable (guest)
  guest_token text,                      -- nullable, stored in browser localStorage
  display_name text,
  joined_at timestamptz default now()
)

-- Questions used in this session, in order
session_questions (
  id uuid pk,
  session_id uuid references sessions,
  question_id uuid references questions,
  order_index int,
  revealed_at timestamptz       -- written by the backend when all participants have answered
)

-- Answers (never UPDATE, only INSERT)
answers (
  id uuid pk,
  session_question_id uuid references session_questions,
  participant_id uuid references session_participants,
  question_id uuid references questions,   -- denormalized, for cross-session lookups
  option_key text,                          -- 'a' | 'b' | 'c'
  reason_text text,                         -- nullable
  reason_chip_id uuid,                      -- nullable
  attachment_ref text,                      -- nullable, reserved for voice/image
  visibility text default 'session',        -- 'private' | 'session' | 'circle' | 'public'
  created_at timestamptz default now()
)

-- Post-reveal discussion
thread_messages (
  id uuid pk,
  session_question_id uuid references session_questions,
  participant_id uuid references session_participants,
  kind text,                    -- 'reaction' | 'text'
  body text,
  created_at timestamptz default now()
)

-- Remote mode invites (one answer set can be sent to many people, one row each)
invites (
  id uuid pk,
  session_id uuid references sessions,
  inviter_participant_id uuid references session_participants,
  token text unique,            -- short random string used in the URL
  recipient_label text,         -- inviter's own note of who this is
  personal_note text,           -- the one line the inviter writes
  child_session_id uuid,        -- the comparison created once they answer
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
)

-- Analytics
events (
  id uuid pk,
  profile_id uuid,
  guest_token text,
  session_id uuid,
  name text,
  props jsonb,
  created_at timestamptz default now()
)2. Backend Security Rules (RLS + Edge Function)

This is the most important section. It must be implemented on the Supabase side.

Read policy on answers

A participant may read an answer row if and only if either:

It is their own answer, or

Every participant in that session_question has submitted (i.e. revealed_at is not null)

Reveal logic

Create an Edge Function submit_answer(session_question_id, option_key, reason_text?, reason_chip_id?):

Insert the answer

Count the session's participants and the answers already recorded for that session_question

If equal, set session_questions.revealed_at = now()

Return { revealed: true | false }

Never decide "everyone answered, so show the other side" in the frontend. The frontend only renders based on revealed_at.

Guest access

Unregistered users are identified by a guest_token (a UUID generated in the browser and stored in localStorage). RLS policies must support both auth.uid() and a guest token passed in the request header.                                                                 For this first step, only build: the database schema above with RLS policies, plus a minimal single-player flow — a page where one person picks a topic, answers 3 questions one at a time, and after each answer sees how everyone else answered (majority/minority). No room codes, no invites, no realtime, no second participant yet.               3.Analytics (events table, from v1)

session_created        { kind }
participant_joined     { session_id, is_guest }
topics_selected        { count, duration_ms }
questions_selected     { duration_ms }
answer_submitted       { question_id, has_reason }
question_revealed      { question_id, same: true|false }
prompt_tapped          { question_id, prompt_type }   -- signal: how they like to talk
question_skipped       { question_id }                 -- signal: question quality
thread_message_sent    { kind }
session_ended          { question_count, duration_ms }
invite_created         { has_personal_note }
invite_opened          { token }
invite_completed       { token }
bridge_from_group      { }                             -- group session → pair session

Dashboard metrics: share of reveals where at least one person replies; invite open rate and completion rate; completion rate with vs. without a handwritten note; repeat session rate for the same pair.      4.Visual and Copy Principles

The landing page must look clean and branded — it's the main thing telling a recipient this isn't a phishing link

The topic cloud is scattered and irregular — never a tidy grid, never form-like

Use social language throughout: "Your turn", "Amy's waiting on you"

Never use research language: progress bars, completion percentages, "analyzing…", "you've answered X questions"

After the reveal, the interface goes quiet — the more boring it is, the more people look up and talk

Configure Open Graph meta tags so iMessage renders a rich preview card (product name, "3 questions, 30 seconds", one clean image)

Keep the domain short; links must not carry long query parameters

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/abf810ce-7354-4ef3-882b-cd32832cc345).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

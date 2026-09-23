import { createHash } from "node:crypto";

import type { Snapshot } from "@/lib/remote-shared";

/**
 * Person identity across sessions.
 *
 * A registered person is keyed by profile_id. A guest is keyed by a one-way hash
 * of their guest token ("g" + 32 hex) — never the token itself, because this key
 * ends up in /with/ URLs and responses the other person can see. Must match
 * public.public_person_key() in the database. A signed-in viewer is matched
 * by profile_id as well as by the guest token of the browser they are on, so
 * their history follows them across devices. If a guest loses their token
 * (cleared storage, new device, private window) they become a new person until
 * they sign in.
 */
export function personKeyOf(row: { profile_id: string | null; guest_token: string | null; id: string }) {
  if (row.profile_id) return row.profile_id;
  if (row.guest_token) return guestPersonKey(row.guest_token);
  return row.id;
}

export function guestPersonKey(guestToken: string) {
  return "g" + createHash("sha256").update(guestToken, "utf8").digest("hex").slice(0, 32);
}

type Admin = {
  from: (table: string) => any;
};

/** One question inside a session: both answers plus its thread. */
export type QuestionBlock = {
  sessionQuestionId: string;
  sessionId: string;
  text: string;
  revealed: boolean;
  myLabel: string;
  myReason: string;
  theirLabel: string;
  theirReason: string;
  matched: boolean | null;
  messageCount: number;
  unread: number;
  lastActivity: string;
};

/** A "block" is one session: the set of questions sent together. */
export type SessionBlock = {
  sessionId: string;
  /** How the two of you were together: remote, irl_pair, group. */
  kind: string;
  topic: string;
  total: number;
  different: number;
  messageCount: number;
  unread: number;
  revealed: boolean;
  lastActivity: string;
  questions: QuestionBlock[];
};


export type Person = {
  personKey: string;
  name: string;
  sessions: SessionBlock[];
};

const NIL = "00000000-0000-0000-0000-000000000000";

/** A link that has gone out but has no answers back yet. */
export type PendingInvite = {
  token: string;
  label: string;
  note: string;
  sentAt: string;
  opened: boolean;
  sessionId: string;
};

/**
 * Sent, not yet answered. This is the only surface the sender has between
 * hitting send and the other person replying, so it has to exist somewhere.
 */
export async function loadPendingInvites(
  admin: Admin,
  guestToken: string,
  profileId?: string,
): Promise<PendingInvite[]> {
  const { myParticipants } = await import("@/lib/identity.server");
  const mine = await myParticipants(admin, { guestToken, profileId });
  const parentIds = [
    ...new Set(mine.filter((p) => p.role === "sender").map((p) => p.session_id)),
  ];
  if (parentIds.length === 0) return [];

  const { data } = await admin
    .from("invites")
    .select("token, recipient_label, personal_note, opened_at, created_at, session_id")
    .in("session_id", parentIds)
    .is("completed_at", null)
    .order("created_at", { ascending: false });

  return ((data ?? []) as {
    token: string;
    recipient_label: string | null;
    personal_note: string | null;
    opened_at: string | null;
    created_at: string;
    session_id: string;
  }[]).map((row) => ({
    token: row.token,
    label: row.recipient_label ?? "Someone",
    note: row.personal_note ?? "",
    sentAt: row.created_at,
    opened: Boolean(row.opened_at),
    sessionId: row.session_id,
  }));
}


/** All blocks I share with anyone, grouped by person rather than by session. */
export async function loadRelationships(
  admin: Admin,
  guestToken: string,
  profileId?: string,
): Promise<Person[]> {
  const identities: { column: string; value: string }[] = [];
  if (guestToken) identities.push({ column: "guest_token", value: guestToken });
  if (profileId) identities.push({ column: "profile_id", value: profileId });
  if (identities.length === 0) return [];

  type Participant = {
    id: string;
    session_id: string;
    profile_id: string | null;
    guest_token: string | null;
    display_name: string | null;
  };

  const found = await Promise.all(
    identities.map(async (identity) => {
      const { data } = await admin
        .from("session_participants")
        .select("id, session_id, profile_id, guest_token, display_name")
        .eq(identity.column, identity.value);
      return (data ?? []) as Participant[];
    }),
  );
  const myRows = [...new Map(found.flat().map((row) => [row.id, row])).values()];
  if (myRows.length === 0) return [];

  const sessionIds = [...new Set(myRows.map((r) => r.session_id))];
  const myIds = new Set(myRows.map((r) => r.id));

  const { data: everyone } = await admin
    .from("session_participants")
    .select("id, session_id, profile_id, guest_token, display_name")
    .in("session_id", sessionIds);
  const others = ((everyone ?? []) as Participant[]).filter((p) => !myIds.has(p.id));

  // How the two of you were together — remote invite, in person, group room.
  const { data: sessionRows } = await admin
    .from("sessions")
    .select("id, kind")
    .in("id", sessionIds);
  const kindOf = new Map<string, string>(
    ((sessionRows ?? []) as { id: string; kind: string }[]).map((row) => [row.id, row.kind]),
  );


  const { data: sqRows } = await admin
    .from("session_questions")
    .select("id, session_id, question_id, revealed_at, order_index, snapshot")
    .in("session_id", sessionIds)
    .order("order_index");
  const sqs = (sqRows ?? []) as {
    id: string;
    session_id: string;
    question_id: string;
    revealed_at: string | null;
    order_index: number;
    snapshot: unknown;
  }[];
  const sqIds = sqs.map((q) => q.id);
  const scope = sqIds.length ? sqIds : [NIL];

  // Topic label per session, taken from the questions that were sent together.
  const questionIds = [...new Set(sqs.map((q) => q.question_id))];
  const { data: questionRows } = await admin
    .from("questions")
    .select("id, topic:topics(label)")
    .in("id", questionIds.length ? questionIds : [NIL]);
  const topicOf = new Map<string, string>();
  for (const row of (questionRows ?? []) as { id: string; topic: { label: string } | null }[]) {
    if (row.topic?.label) topicOf.set(row.id, row.topic.label);
  }

  const { data: answerRows } = await admin
    .from("answers")
    .select("session_question_id, participant_id, option_key, reason_text, answer_role, created_at")
    .in("session_question_id", scope)
    .order("created_at");
  const answers = (answerRows ?? []) as {
    session_question_id: string;
    participant_id: string;
    option_key: string;
    reason_text: string | null;
    answer_role: string;
    created_at: string;
  }[];

  const { data: messageRows } = await admin
    .from("thread_messages")
    .select("session_question_id, participant_id, created_at")
    .in("session_question_id", scope);
  const messages = (messageRows ?? []) as {
    session_question_id: string;
    participant_id: string;
    created_at: string;
  }[];

  const { data: readRows } = await admin
    .from("thread_reads")
    .select("session_question_id, participant_id, read_at")
    .in("session_question_id", scope);
  const reads = (readRows ?? []) as {
    session_question_id: string;
    participant_id: string;
    read_at: string;
  }[];

  const byPerson = new Map<string, Person>();

  for (const sq of sqs) {
    const meHere = myRows.find((r) => r.session_id === sq.session_id);
    if (!meHere) continue;
    const partner = others.find((p) => p.session_id === sq.session_id);
    if (!partner) continue;

    const snap = sq.snapshot as Snapshot | null;
    if (!snap) continue;

    const selfAnswers = answers.filter(
      (a) => a.session_question_id === sq.id && a.answer_role !== "about_other",
    );
    const my = [...selfAnswers].reverse().find((a) => a.participant_id === meHere.id);
    if (!my) continue;
    const theirs = sq.revealed_at
      ? [...selfAnswers].reverse().find((a) => a.participant_id === partner.id)
      : undefined;

    const label = (key: string | undefined) =>
      snap.options.find((o) => o.key === key)?.label ?? "";

    const mine = messages.filter((m) => m.session_question_id === sq.id);
    const readAt = reads.find(
      (r) => r.session_question_id === sq.id && r.participant_id === meHere.id,
    )?.read_at;
    const unread = mine.filter(
      (m) =>
        m.participant_id !== meHere.id && (!readAt || new Date(m.created_at) > new Date(readAt)),
    ).length;

    const times = [
      my.created_at,
      ...(theirs ? [theirs.created_at] : []),
      ...(sq.revealed_at ? [sq.revealed_at] : []),
      ...mine.map((m) => m.created_at),
    ];
    const lastActivity = times.sort()[times.length - 1] ?? my.created_at;

    const question: QuestionBlock = {
      sessionQuestionId: sq.id,
      sessionId: sq.session_id,
      text: snap.text,
      revealed: Boolean(sq.revealed_at),
      myLabel: label(my.option_key),
      myReason: my.reason_text ?? "",
      theirLabel: label(theirs?.option_key),
      theirReason: theirs?.reason_text ?? "",
      matched: theirs ? my.option_key === theirs.option_key : null,
      messageCount: mine.length,
      unread,
      lastActivity,
    };

    const key = personKeyOf(partner);
    const person =
      byPerson.get(key) ??
      ({ personKey: key, name: partner.display_name ?? "Someone", sessions: [] } as Person);
    const block =
      person.sessions.find((s) => s.sessionId === sq.session_id) ??
      ({
        sessionId: sq.session_id,
        kind: kindOf.get(sq.session_id) ?? "remote",
        topic: topicOf.get(sq.question_id) ?? "",

        total: 0,
        different: 0,
        messageCount: 0,
        unread: 0,
        revealed: false,
        lastActivity,
        questions: [],
      } as SessionBlock);
    if (!block.topic) block.topic = topicOf.get(sq.question_id) ?? "";
    block.questions.push(question);
    block.total += 1;
    if (question.matched === false) block.different += 1;
    block.messageCount += question.messageCount;
    block.unread += question.unread;
    block.revealed = block.revealed || question.revealed;
    if (block.lastActivity < lastActivity) block.lastActivity = lastActivity;
    if (!person.sessions.includes(block)) person.sessions.push(block);
    byPerson.set(key, person);
  }

  const people = [...byPerson.values()];
  for (const person of people) {
    person.sessions.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  }
  people.sort((a, b) =>
    (a.sessions[0]?.lastActivity ?? "") < (b.sessions[0]?.lastActivity ?? "") ? 1 : -1,
  );
  return people;
}

/** Someone deliberately added as a connection — usually from a group room. */
export type ConnectionPerson = { personKey: string; name: string; addedAt: string };

/**
 * Connections are the only durable trace of a group room: the session itself is
 * a one-off, but "add this person" has to survive the refresh.
 */
export async function loadConnections(
  admin: Admin,
  guestToken: string,
  profileId?: string,
): Promise<ConnectionPerson[]> {
  const { myParticipants } = await import("@/lib/identity.server");
  const mine = await myParticipants(admin, { guestToken, profileId });
  const myIds = mine.map((row) => row.id);
  if (myIds.length === 0) return [];

  const { data: links } = await admin
    .from("connections")
    .select("target_participant_id, created_at")
    .in("owner_participant_id", myIds);
  const rows = (links ?? []) as { target_participant_id: string; created_at: string }[];
  if (rows.length === 0) return [];

  const targets = [...new Set(rows.map((r) => r.target_participant_id))];
  const { data: peopleRows } = await admin
    .from("session_participants")
    .select("id, display_name, profile_id, guest_token")
    .in("id", targets);

  const byKey = new Map<string, ConnectionPerson>();
  for (const person of (peopleRows ?? []) as {
    id: string;
    display_name: string | null;
    profile_id: string | null;
    guest_token: string | null;
  }[]) {
    const key = personKeyOf(person);
    const addedAt = rows.find((r) => r.target_participant_id === person.id)?.created_at ?? "";
    const existing = byKey.get(key);
    if (!existing || existing.addedAt < addedAt) {
      byKey.set(key, { personKey: key, name: person.display_name ?? "Someone", addedAt });
    }
  }
  return [...byKey.values()].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

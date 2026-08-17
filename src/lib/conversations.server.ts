import type { Snapshot } from "@/lib/remote-shared";

/**
 * Person identity across sessions.
 *
 * A registered person is keyed by profile_id, a guest by guest_token. Both are
 * uuids, so one column of route param covers both. If a guest loses their token
 * (cleared storage, new device, private window) they become a new person: their
 * old blocks stay readable only from the original browser, and any new session
 * shows up as a separate row. Signing in is the only durable fix.
 */
export function personKeyOf(row: { profile_id: string | null; guest_token: string | null; id: string }) {
  return row.profile_id ?? row.guest_token ?? row.id;
}

type Admin = {
  from: (table: string) => any;
};

export type Block = {
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

export type Person = {
  personKey: string;
  name: string;
  blocks: Block[];
};

const NIL = "00000000-0000-0000-0000-000000000000";

/** All blocks I share with anyone, grouped by person rather than by session. */
export async function loadRelationships(admin: Admin, guestToken: string): Promise<Person[]> {
  const { data: mine } = await admin
    .from("session_participants")
    .select("id, session_id, profile_id, guest_token, display_name")
    .eq("guest_token", guestToken);
  const myRows = (mine ?? []) as {
    id: string;
    session_id: string;
    profile_id: string | null;
    guest_token: string | null;
    display_name: string | null;
  }[];
  if (myRows.length === 0) return [];

  const sessionIds = [...new Set(myRows.map((r) => r.session_id))];
  const myIds = new Set(myRows.map((r) => r.id));

  const { data: everyone } = await admin
    .from("session_participants")
    .select("id, session_id, profile_id, guest_token, display_name")
    .in("session_id", sessionIds);
  const others = ((everyone ?? []) as typeof myRows).filter((p) => !myIds.has(p.id));

  const { data: sqRows } = await admin
    .from("session_questions")
    .select("id, session_id, revealed_at, order_index, snapshot")
    .in("session_id", sessionIds)
    .order("order_index");
  const sqs = (sqRows ?? []) as {
    id: string;
    session_id: string;
    revealed_at: string | null;
    order_index: number;
    snapshot: unknown;
  }[];
  const sqIds = sqs.map((q) => q.id);
  const scope = sqIds.length ? sqIds : [NIL];

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

    const key = personKeyOf(partner);
    const person =
      byPerson.get(key) ??
      ({ personKey: key, name: partner.display_name ?? "Someone", blocks: [] } as Person);
    person.blocks.push({
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
    });
    byPerson.set(key, person);
  }

  const people = [...byPerson.values()];
  for (const person of people) {
    person.blocks.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  }
  people.sort((a, b) =>
    (a.blocks[0]?.lastActivity ?? "") < (b.blocks[0]?.lastActivity ?? "") ? 1 : -1,
  );
  return people;
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type AdminMetrics = {
  windowDays: number;
  rooms: { kind: string; started: number; finished: number }[];
  invites: { sent: number; opened: number; completed: number };
  play: {
    answers: number;
    revealedQuestions: number;
    questionsWithTalk: number;
    messages: number;
  };
  people: { total: number; returning: number };
  daily: { day: string; sessions: number; answers: number }[];
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/** Everything the dashboard shows, read straight off the tables — no new schema. */
export async function readMetrics(admin: Admin, windowDays: number): Promise<AdminMetrics> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  const [sessions, participants, answers, invites, sqs, messages] = await Promise.all([
    admin.from("sessions").select("id, kind, created_at, ended_at").gte("created_at", since),
    admin.from("session_participants").select("id, session_id, profile_id, guest_token"),
    admin.from("answers").select("id, created_at").gte("created_at", since),
    admin.from("invites").select("id, opened_at, completed_at, created_at").gte("created_at", since),
    admin.from("session_questions").select("id, session_id, revealed_at"),
    admin.from("thread_messages").select("id, session_question_id, created_at").gte("created_at", since),
  ]);

  const sessionRows = sessions.data ?? [];
  const sessionIds = new Set(sessionRows.map((row) => row.id));

  const byKind = new Map<string, { started: number; finished: number }>();
  for (const row of sessionRows) {
    const entry = byKind.get(row.kind) ?? { started: 0, finished: 0 };
    entry.started += 1;
    if (row.ended_at) entry.finished += 1;
    byKind.set(row.kind, entry);
  }

  // "Returning" = the same person (profile or guest token) in more than one room.
  const seen = new Map<string, Set<string>>();
  for (const row of participants.data ?? []) {
    const identity = row.profile_id ?? row.guest_token;
    if (!identity) continue;
    if (!seen.has(identity)) seen.set(identity, new Set());
    seen.get(identity)!.add(row.session_id);
  }

  const revealed = (sqs.data ?? []).filter(
    (row) => row.revealed_at && sessionIds.has(row.session_id),
  );
  const talked = new Set((messages.data ?? []).map((row) => row.session_question_id));

  const daily = new Map<string, { sessions: number; answers: number }>();
  const bump = (iso: string, field: "sessions" | "answers") => {
    const key = dayKey(iso);
    const entry = daily.get(key) ?? { sessions: 0, answers: 0 };
    entry[field] += 1;
    daily.set(key, entry);
  };
  for (const row of sessionRows) bump(row.created_at, "sessions");
  for (const row of answers.data ?? []) bump(row.created_at, "answers");

  return {
    windowDays,
    rooms: [...byKind.entries()]
      .map(([kind, value]) => ({ kind, ...value }))
      .sort((a, b) => b.started - a.started),
    invites: {
      sent: invites.data?.length ?? 0,
      opened: invites.data?.filter((row) => row.opened_at).length ?? 0,
      completed: invites.data?.filter((row) => row.completed_at).length ?? 0,
    },
    play: {
      answers: answers.data?.length ?? 0,
      revealedQuestions: revealed.length,
      questionsWithTalk: revealed.filter((row) => talked.has(row.id)).length,
      messages: messages.data?.length ?? 0,
    },
    people: {
      total: seen.size,
      returning: [...seen.values()].filter((set) => set.size > 1).length,
    },
    daily: [...daily.entries()]
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

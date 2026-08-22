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

/** Only the addresses listed in ADMIN_EMAILS can read the dashboard. */
export function assertAdmin(claims: unknown) {
  const allowed = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const email = String((claims as { email?: string } | null)?.email ?? "").toLowerCase();
  if (!email || !allowed.includes(email)) throw new Error("Not allowed");
}

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

export type AdminSessionRow = {
  id: string;
  kind: string;
  createdAt: string;
  endedAt: string | null;
  people: number;
  revealed: number;
  total: number;
};

export type AdminQuestionBlock = {
  sessionQuestionId: string;
  orderIndex: number;
  text: string;
  questionType: string;
  options: { key: string; label: string; votes: number }[];
  totalVotes: number;
  /** Impression questions store a second row per person — kept apart. */
  selfOptions: { key: string; label: string; votes: number }[] | null;
  revealedAt: string | null;
  skipped: boolean;
  /** Seconds from the previous reveal (or room open) to this reveal. */
  secondsOnQuestion: number | null;
  /** Seconds between the first and last answer submitted. */
  answerWindowSeconds: number | null;
  /** 0 = dead even, 1 = unanimous. */
  imbalance: number | null;
  split: "even" | "leaning" | "lopsided" | null;
};

export type AdminSessionDetail = {
  id: string;
  kind: string;
  createdAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  participants: string[];
  questions: AdminQuestionBlock[];
  evenCount: number;
  lopsidedCount: number;
};

function classify(counts: number[]): { imbalance: number; split: AdminQuestionBlock["split"] } {
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...counts, 0);
  const share = total ? top / total : 0;
  // 0 when perfectly split across the used options, 1 when everyone agrees.
  const even = 1 / Math.max(counts.length, 2);
  const imbalance = total ? Math.min(1, Math.max(0, (share - even) / (1 - even))) : 0;
  return { imbalance, split: imbalance <= 0.34 ? "even" : imbalance <= 0.67 ? "leaning" : "lopsided" };
}

/** Room list for the dashboard, newest first. */
export async function readSessions(admin: Admin, windowDays: number): Promise<AdminSessionRow[]> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  const [sessions, participants, sqs] = await Promise.all([
    admin
      .from("sessions")
      .select("id, kind, created_at, ended_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    admin.from("session_participants").select("id, session_id"),
    admin.from("session_questions").select("id, session_id, revealed_at"),
  ]);

  const peopleBySession = new Map<string, number>();
  for (const row of participants.data ?? [])
    peopleBySession.set(row.session_id, (peopleBySession.get(row.session_id) ?? 0) + 1);

  const qBySession = new Map<string, { total: number; revealed: number }>();
  for (const row of sqs.data ?? []) {
    const entry = qBySession.get(row.session_id) ?? { total: 0, revealed: 0 };
    entry.total += 1;
    if (row.revealed_at) entry.revealed += 1;
    qBySession.set(row.session_id, entry);
  }

  return (sessions.data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    people: peopleBySession.get(row.id) ?? 0,
    revealed: qBySession.get(row.id)?.revealed ?? 0,
    total: qBySession.get(row.id)?.total ?? 0,
  }));
}

/** One room, question by question: who picked what, and how long it took. */
export async function readSessionDetail(
  admin: Admin,
  sessionId: string,
): Promise<AdminSessionDetail | null> {
  const { data: session } = await admin
    .from("sessions")
    .select("id, kind, created_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const [people, sqs] = await Promise.all([
    admin.from("session_participants").select("display_name, joined_at").eq("session_id", sessionId),
    admin
      .from("session_questions")
      .select(
        "id, order_index, revealed_at, questions(text, option_a, option_b, option_c, question_type)",
      )
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true }),
  ]);

  const rows = (sqs.data ?? []) as unknown as {
    id: string;
    order_index: number;
    revealed_at: string | null;
    questions: {
      text: string;
      option_a: string;
      option_b: string;
      option_c: string | null;
      question_type: string;
    } | null;
  }[];

  const { data: answers } = await admin
    .from("answers")
    .select("session_question_id, option_key, answer_role, created_at")
    .in(
      "session_question_id",
      rows.map((row) => row.id),
    );

  const byQuestion = new Map<
    string,
    { about: Map<string, number>; self: Map<string, number>; times: string[] }
  >();
  for (const row of answers ?? []) {
    const entry =
      byQuestion.get(row.session_question_id) ??
      { about: new Map<string, number>(), self: new Map<string, number>(), times: [] };
    const bucket = row.answer_role === "about_other" ? entry.about : entry.self;
    bucket.set(row.option_key, (bucket.get(row.option_key) ?? 0) + 1);
    entry.times.push(row.created_at);
    byQuestion.set(row.session_question_id, entry);
  }

  let previousMark = session.created_at;
  const questions: AdminQuestionBlock[] = rows.map((row) => {
    const q = row.questions;
    const tally = byQuestion.get(row.id);
    const labels: [string, string | null][] = [
      ["a", q?.option_a ?? "A"],
      ["b", q?.option_b ?? "B"],
      ["c", q?.option_c ?? null],
    ];

    const isImpression = (q?.question_type ?? "") === "impression";
    // For impression rows the "about_other" guesses are the split people talk about.
    const primary = isImpression ? (tally?.about ?? new Map()) : (tally?.self ?? new Map());
    const secondary = isImpression ? (tally?.self ?? new Map()) : null;

    const build = (source: Map<string, number>) =>
      labels
        .filter(([, label]) => label)
        .map(([key, label]) => ({ key, label: label!, votes: source.get(key) ?? 0 }));

    const options = build(primary);
    const totalVotes = options.reduce((a, o) => a + o.votes, 0);
    const used = options.filter((o) => o.votes > 0).length;
    const { imbalance, split } = classify(options.map((o) => o.votes));

    const times = (tally?.times ?? []).slice().sort();
    const answerWindowSeconds =
      times.length > 1
        ? Math.round(
            (new Date(times[times.length - 1]!).getTime() - new Date(times[0]!).getTime()) / 1000,
          )
        : times.length === 1
          ? 0
          : null;

    let secondsOnQuestion: number | null = null;
    if (row.revealed_at) {
      secondsOnQuestion = Math.max(
        0,
        Math.round((new Date(row.revealed_at).getTime() - new Date(previousMark).getTime()) / 1000),
      );
      previousMark = row.revealed_at;
    }

    const skipped = !row.revealed_at && totalVotes === 0;

    return {
      sessionQuestionId: row.id,
      orderIndex: row.order_index,
      text: q?.text ?? "(question removed)",
      questionType: q?.question_type ?? "ab",
      options,
      totalVotes,
      selfOptions: secondary ? build(secondary) : null,
      revealedAt: row.revealed_at,
      skipped,
      secondsOnQuestion,
      answerWindowSeconds,
      imbalance: totalVotes ? imbalance : null,
      split: totalVotes && used > 0 ? split : null,
    };
  });

  return {
    id: session.id,
    kind: session.kind,
    createdAt: session.created_at,
    endedAt: session.ended_at,
    durationSeconds: session.ended_at
      ? Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.created_at).getTime()) / 1000,
        )
      : null,
    participants: (people.data ?? [])
      .slice()
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((row) => row.display_name || "Someone"),
    questions,
    evenCount: questions.filter((q) => q.split === "even").length,
    lopsidedCount: questions.filter((q) => q.split === "lopsided").length,
  };
}

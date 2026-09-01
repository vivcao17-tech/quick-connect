/**
 * Dashboard reads.
 *
 * Every view is one Postgres function call — the same single-round-trip shape
 * used by people_overview and relationships_detail. The waterfall problem is
 * worse here than anywhere else, so nothing on this page fans out into
 * sequential PostgREST calls.
 */

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type Range = { from: string; to: string; includeTest: boolean };

async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (admin as never as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(fn, args);
  if (error) throw new Error((error as { message?: string }).message ?? "Report failed");
  return data as T;
}

const window_ = (range: Range) => ({
  _from: range.from,
  _to: range.to,
  _include_test: range.includeTest,
});

export type OverviewNumbers = {
  inviteCompletionRate: number | null;
  invitesOpened: number;
  invitesCompleted: number;
  revealToReplyRate: number | null;
  reveals: number;
  repeatPairRate: number | null;
  pairs: number;
  bridgeRate: number | null;
  emailCaptureRate: number | null;
  finishers: number;
  medianRevealToFirstMessage: number | null;
  sessions: number;
  people: number;
  kFactor: number | null;
  invitesPerFinisher: number | null;
  medianTimeToSecondSession: number | null;
  medianSessionDepth: number | null;
  medianMessagesPerRevealedQuestion: number | null;
};

export type Overview = { current: OverviewNumbers; previous: OverviewNumbers };

export const readOverview = (admin: Admin, range: Range) =>
  rpc<Overview>(admin, "admin_overview", window_(range));

export type FunnelStep = { key: string; label: string; count: number };
export type FunnelSegment = { segment: string; sent: number; steps: FunnelStep[] };

export const readFunnel = (admin: Admin, range: Range, segment: string) =>
  rpc<FunnelSegment[]>(admin, "admin_funnel", { ...window_(range), _segment: segment });

export type Cohort = {
  cohort: string;
  size: number;
  medianSessions: number | null;
  medianPeople: number | null;
  initiatorShare: number | null;
  cells: { week: number; active: number }[];
};

export const readCohorts = (admin: Admin, activity: string, includeTest: boolean, weeks: number) =>
  rpc<Cohort[]>(admin, "admin_cohorts", {
    _activity: activity,
    _include_test: includeTest,
    _weeks: weeks,
  });

export type PersonRow = {
  personKey: string;
  name: string | null;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  identity: "guest" | "email" | "account";
};

export const readPeople = (admin: Admin, q: string, includeTest: boolean) =>
  rpc<PersonRow[]>(admin, "admin_people", { _q: q, _include_test: includeTest });

export type PersonTimeline = {
  personKey: string;
  summary: {
    name: string | null;
    firstSeen: string | null;
    lastSeen: string | null;
    sessions: number;
    messagesSent: number;
    messagesReceived: number;
    distinctPeople: number;
    everInitiated: boolean | null;
    identity: "guest" | "email" | "account";
    linked: boolean;
    emails: string[];
    participantRows: number;
    gapSinceLastVisitSeconds: number | null;
  };
  sessions: {
    sessionId: string;
    kind: string;
    isTest: boolean;
    startedAt: string;
    joinedAt: string;
    endedAt: string | null;
    role: string;
    others: string[];
    questions: {
      orderIndex: number;
      text: string;
      optionKey: string;
      label: string;
      role: string;
      hasReason: boolean;
      reason: string | null;
      answeredAt: string;
      revealedAt: string | null;
    }[];
    messages: { at: string; mine: boolean; chars: number; kind: string; body: string | null }[];
  }[];
  events: { name: string; at: string; sessionId: string | null; props: Record<string, string | number | boolean | null> }[];
};

export const readPersonTimeline = (admin: Admin, personKey: string) =>
  rpc<PersonTimeline>(admin, "admin_person_timeline", { _person_key: personKey });

export type QuestionRow = {
  questionId: string;
  text: string;
  topic: string | null;
  type: string;
  spice: number;
  mode: string;
  timesShown: number;
  timesAnswered: number;
  skipRate: number | null;
  passRate: number | null;
  options: { key: string; label: string | null; votes: number }[];
  medianAnswerWindowSeconds: number | null;
  avgAnswerWindowSeconds: number | null;
  medianSecondsToAnswer: number | null;
  threads: number;
  medianMessagesPerThread: number | null;
  bridgeTaps: number;
  mindChanged: number;
  followUp: string | null;
  followUpShown: number;
  followUpAnswered: number;
  followUpAnswerRate: number | null;
};

export const readQuestionPerformance = (admin: Admin, includeTest: boolean) =>
  rpc<QuestionRow[]>(admin, "admin_question_performance", { _include_test: includeTest });

export type SessionRow = {
  sessionId: string;
  kind: string;
  isTest: boolean;
  startedAt: string;
  endedAt: string | null;
  people: number;
  participants: {
    participantId: string;
    name: string;
    role: string;
    answered: number;
    lastAnsweredIndex: number | null;
  }[];
  totalQuestions: number;
  revealedQuestions: number;
  reachedReveal: boolean;
  secondsToFirstReveal: number | null;
  secondsToLastActivity: number | null;
  questions: {
    orderIndex: number;
    text: string;
    revealed: boolean;
    answers: number;
    messages: number;
    split: { key: string; votes: number }[];
  }[];
};

export const readSessionRows = (admin: Admin, range: Range) =>
  rpc<SessionRow[]>(admin, "admin_session_rows", window_(range));

export type InviteReport = {
  segments: {
    segment: string;
    created: number;
    opened: number;
    completed: number;
    median_to_open: number | null;
    median_to_complete: number | null;
  }[];
  abandoned: {
    token: string;
    label: string | null;
    hasNote: boolean;
    openedAt: string;
    lastQuestionIndex: number | null;
    sessionId: string;
  }[];
};

export const readInvites = (admin: Admin, range: Range) =>
  rpc<InviteReport>(admin, "admin_invites", window_(range));

export type NotificationReport = {
  byType: {
    type: string;
    sent: number;
    emailed: number;
    read: number;
    clicked: number;
    clickThroughRate: number | null;
    ledToMessage: number;
  }[];
  delivery: { status: string; n: number }[];
};

export const readNotifications = (admin: Admin, range: Range) =>
  rpc<NotificationReport>(admin, "admin_notifications", window_(range));

/** Mark a room as one of mine, so it stops polluting every number on the page. */
export async function setSessionTest(admin: Admin, sessionId: string, isTest: boolean) {
  const { error } = await admin.from("sessions").update({ is_test: isTest }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  return { sessionId, isTest };
}

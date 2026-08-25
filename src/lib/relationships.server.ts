/**
 * The full "people I've shared questions with" graph in one round trip.
 *
 * relationships_detail() in Postgres does the identity matching, per-question
 * answer pairing, unread counting, note lookup and pending-invite scan in a
 * single call. The old path ran ~12 sequential PostgREST requests; from the
 * edge each one costs 150–600ms of network, so the waterfall took seconds.
 */

type Admin = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: { people?: DetailPerson[]; waiting?: DetailWaiting[] } | null; error: { message: string } | null }>;
};

/** One question inside a session: both answers plus its thread. */
export type DetailQuestion = {
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
export type DetailSession = {
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
  questions: DetailQuestion[];
};

export type DetailPerson = {
  personKey: string;
  name: string;
  nickname: string;
  contact: string;
  note: string;
  lastActivity: string;
  sessions: DetailSession[];
};

/** A link that has gone out but has no answers back yet. */
export type DetailWaiting = {
  token: string;
  label: string;
  note: string;
  sentAt: string;
  opened: boolean;
  sessionId: string;
};

export type RelationshipsDetail = {
  people: DetailPerson[];
  waiting: DetailWaiting[];
};

export async function loadDetail(
  admin: Admin,
  guestToken: string,
  profileId?: string,
): Promise<RelationshipsDetail> {
  const { data, error } = await admin.rpc("relationships_detail", {
    _guest_token: guestToken,
    _profile_id: profileId ?? null,
  });
  if (error) throw new Error(error.message);
  return { people: data?.people ?? [], waiting: data?.waiting ?? [] };
}

/** Plain words for where the two of you first ended up together. */
export function metLabel(kind: string): string {
  if (kind === "irl_pair") return "Met in person";
  if (kind === "group") return "Met in a group session";
  return "Met through a remote invite";
}

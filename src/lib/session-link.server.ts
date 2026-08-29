type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

function newToken(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 24);
}

/** One durable, secret way back into this session for this one participant. */
export async function ensureSessionLink(
  admin: Admin,
  opts: { sessionId: string; participantId: string },
): Promise<string> {
  const { data: existing } = await admin
    .from("session_links")
    .select("token")
    .eq("participant_id", opts.participantId)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = newToken();
  const { data: inserted } = await admin
    .from("session_links")
    .insert({ token, session_id: opts.sessionId, participant_id: opts.participantId })
    .select("token")
    .maybeSingle();
  return inserted?.token ?? token;
}

export type SessionLinkTarget = {
  path: string;
  withName: string;
  isGroup: boolean;
  questionCount: number;
};

/**
 * Where this person should land: the pair block they shared, or the room's
 * results. Never the home page.
 */
export async function describeSessionForParticipant(
  admin: Admin,
  opts: { sessionId: string; participantId: string },
): Promise<SessionLinkTarget> {
  const { data: session } = await admin
    .from("sessions")
    .select("id, kind, room_code")
    .eq("id", opts.sessionId)
    .maybeSingle();

  const { count } = await admin
    .from("session_questions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", opts.sessionId);

  const { data: people } = await admin
    .from("session_participants")
    .select("id, display_name, guest_token, profile_id")
    .eq("session_id", opts.sessionId);

  const others = (people ?? []).filter((p) => p.id !== opts.participantId);
  const isGroup = session?.kind === "group" || session?.kind === "group_async" || others.length > 1;

  if (session?.kind === "group_async") {
    return {
      path: `/ga/${opts.sessionId}`,
      withName: "your group",
      isGroup: true,
      questionCount: count ?? 0,
    };
  }

  if (isGroup) {
    return {
      path: `/g/${opts.sessionId}`,
      withName: session?.room_code ? `room ${session.room_code}` : "your room",
      isGroup: true,
      questionCount: count ?? 0,
    };
  }

  const other = others[0];
  const key = other ? (other.profile_id ?? other.guest_token ?? other.id) : "";
  return {
    path: key ? `/with/${key}/${opts.sessionId}` : `/room/${opts.sessionId}`,
    withName: other?.display_name ?? "them",
    isGroup: false,
    questionCount: count ?? 0,
  };
}

/** Resolve a saved link back to the identity and screen it belongs to. */
export async function resolveSessionLink(admin: Admin, token: string) {
  const { data: link } = await admin
    .from("session_links")
    .select("session_id, participant_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;

  const { data: participant } = await admin
    .from("session_participants")
    .select("guest_token")
    .eq("id", link.participant_id)
    .maybeSingle();

  const target = await describeSessionForParticipant(admin, {
    sessionId: link.session_id,
    participantId: link.participant_id,
  });

  return { guestToken: participant?.guest_token ?? "", path: target.path };
}

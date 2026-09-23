type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

function newToken(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 24);
}

/**
 * A fresh, single-use way back into this session for this one participant.
 * Every email gets its own link; each expires after 24 hours or its first use.
 */
export async function ensureSessionLink(
  admin: Admin,
  opts: { sessionId: string; participantId: string },
): Promise<string> {
  const token = newToken();
  await admin.from("session_links").insert({
    token,
    session_id: opts.sessionId,
    participant_id: opts.participantId,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
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
  const { personKeyOf } = await import("@/lib/conversations.server");
  const key = other ? personKeyOf(other) : "";
  return {
    path: key ? `/with/${key}/${opts.sessionId}` : `/room/${opts.sessionId}`,
    withName: other?.display_name ?? "them",
    isGroup: false,
    questionCount: count ?? 0,
  };
}

type LinkRow = {
  session_id: string;
  participant_id: string;
  expires_at: string;
  used_at: string | null;
};

async function findLink(admin: Admin, token: string): Promise<LinkRow | null> {
  const { data } = await admin
    .from("session_links")
    .select("session_id, participant_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

function isLive(link: LinkRow) {
  return !link.used_at && new Date(link.expires_at).getTime() > Date.now();
}

/** Look without using it up — safe for mail scanners that pre-open links. */
export async function previewSessionLink(admin: Admin, token: string) {
  const link = await findLink(admin, token);
  if (!link) return { status: "missing" as const };
  if (!isLive(link)) return { status: "expired" as const };
  const target = await describeSessionForParticipant(admin, {
    sessionId: link.session_id,
    participantId: link.participant_id,
  });
  return { status: "ready" as const, withName: target.withName, isGroup: target.isGroup };
}

/** Use the link up (atomically) and hand back the identity and screen. */
export async function claimSessionLink(admin: Admin, token: string) {
  const { data: claimed } = await admin
    .from("session_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("session_id, participant_id")
    .maybeSingle();
  if (!claimed) return null;

  const { data: participant } = await admin
    .from("session_participants")
    .select("guest_token")
    .eq("id", claimed.participant_id)
    .maybeSingle();

  const target = await describeSessionForParticipant(admin, {
    sessionId: claimed.session_id,
    participantId: claimed.participant_id,
  });
  return { guestToken: (participant?.guest_token as string | null) ?? "", path: target.path };
}

/**
 * Expired or used link: mail a fresh one to the address already on file for
 * that participant. Forwarding the old email therefore gets the forwarder
 * nothing — the new link only ever goes to the original inbox.
 */
export async function resendSessionLink(admin: Admin, token: string) {
  const link = await findLink(admin, token);
  if (!link) return;
  const { data: recent } = await admin
    .from("session_links")
    .select("token")
    .eq("participant_id", link.participant_id)
    .gt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(1);
  if ((recent ?? []).length > 0) return; // one resend per two minutes
  const { data: row } = await admin
    .from("participant_emails")
    .select("email")
    .eq("participant_id", link.participant_id)
    .maybeSingle();
  if (!row?.email) return;
  const fresh = await ensureSessionLink(admin, {
    sessionId: link.session_id,
    participantId: link.participant_id,
  });
  const target = await describeSessionForParticipant(admin, {
    sessionId: link.session_id,
    participantId: link.participant_id,
  });
  const { sendSessionSavedEmail } = await import("@/lib/email.server");
  await sendSessionSavedEmail(admin as never, {
    to: row.email as string,
    withName: target.withName,
    isGroup: target.isGroup,
    questionCount: target.questionCount,
    path: `/s/${fresh}`,
  });
}

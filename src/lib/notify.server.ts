type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const HOUR = 60 * 60 * 1000;
const BURST_WINDOW = 2 * 60 * 1000;

/**
 * Queue a "someone replied" notification for everyone in the session except the author.
 *
 * Rules:
 * - never notify the author of their own message
 * - a burst of messages inside a couple of minutes collapses into one notification
 * - at most one notification per thread per hour
 * - exception: the very first reply a person ever receives always goes out immediately
 * - the message body is deliberately not stored — only who, which question, and a link back
 */
export async function notifyThreadReply(
  admin: Admin,
  opts: {
    sessionId: string;
    sessionQuestionId: string;
    actorParticipantId: string;
    actorName: string;
    questionText: string;
  },
) {
  const { data: others } = await admin
    .from("session_participants")
    .select("id, guest_token, profile_id")
    .eq("session_id", opts.sessionId)
    .neq("id", opts.actorParticipantId);

  /**
   * An address is saved against one participant row, but it belongs to the
   * person. Look across every row that is the same human, otherwise a reply in
   * a later session silently has nowhere to go.
   */
  async function emailFor(person: {
    id: string;
    guest_token: string | null;
    profile_id: string | null;
  }): Promise<string | null> {
    const direct = await admin
      .from("participant_emails")
      .select("email")
      .eq("participant_id", person.id)
      .maybeSingle();
    if (direct.data?.email) return direct.data.email;

    let siblings = admin.from("session_participants").select("id");
    if (person.profile_id) siblings = siblings.eq("profile_id", person.profile_id);
    else if (person.guest_token) siblings = siblings.eq("guest_token", person.guest_token);
    else return null;

    const { data: rows } = await siblings.limit(200);
    const ids = (rows ?? []).map((r) => r.id).filter((id) => id !== person.id);
    if (ids.length === 0) return null;

    const { data: found } = await admin
      .from("participant_emails")
      .select("email, created_at")
      .in("participant_id", ids)
      .order("created_at", { ascending: false })
      .limit(1);
    return found?.[0]?.email ?? null;
  }

  const now = Date.now();
  const link = `/inbox?q=${opts.sessionQuestionId}`;

  for (const person of others ?? []) {
    const { data: recent } = await admin
      .from("notifications")
      .select("created_at, session_question_id")
      .eq("participant_id", person.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = recent ?? [];
    const firstEver = history.length === 0;

    if (!firstEver) {
      const lastInThread = history.find((n) => n.session_question_id === opts.sessionQuestionId);
      if (lastInThread && now - new Date(lastInThread.created_at).getTime() < HOUR) continue;
      const last = history[0]!;
      if (now - new Date(last.created_at).getTime() < BURST_WINDOW) continue;
    }

    const { data: inserted } = await admin
      .from("notifications")
      .insert({
        participant_id: person.id,
        session_id: opts.sessionId,
        session_question_id: opts.sessionQuestionId,
        actor_name: opts.actorName,
        question_text: opts.questionText,
        link,
      })
      .select("id")
      .maybeSingle();

    // The email follows exactly the same gate as the notification row above:
    // first-ever reply always, otherwise one per thread per hour and no bursts.
    const address = await emailFor(person);
    if (!address) continue;

    // Token link so the mail opens the conversation on any device, no sign-in.
    const { ensureSessionLink } = await import("@/lib/session-link.server");
    const token = await ensureSessionLink(admin, {
      sessionId: opts.sessionId,
      participantId: person.id,
    });

    const { sendReplyEmail } = await import("@/lib/email.server");
    const result = await sendReplyEmail(admin, {
      to: address,
      actorName: opts.actorName,
      questionText: opts.questionText,
      link: `/s/${token}`,
    });
    if (result.sent && inserted?.id) {
      await admin
        .from("notifications")
        .update({ emailed_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  }
}


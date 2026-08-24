import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const guest = z.string().uuid();
const identity = {
  guestToken: guest,
  profileId: z.string().uuid().optional(),
};

/**
 * Every person you've shared a revealed block with, plus the links that are
 * still out there waiting. Waiting comes first in the UI — it is the window
 * where people come back to check.
 */
export const listConversations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships, loadPendingInvites } = await import("@/lib/conversations.server");
    const { linkProfileToGuestRows } = await import("@/lib/identity.server");

    await linkProfileToGuestRows(supabaseAdmin as never, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });

    const { loadNotes } = await import("@/lib/notes.server");
    const [people, waiting, notes] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadPendingInvites(supabaseAdmin as never, data.guestToken, data.profileId),
      loadNotes(supabaseAdmin as never, {
        guestToken: data.guestToken,
        profileId: data.profileId,
      }),
    ]);

    return {
      waiting,
      people: people
        .filter((person) => person.sessions.some((session) => session.revealed))
        .map((person) => ({
          personKey: person.personKey,
          name: notes.get(person.personKey)?.nickname || person.name,
          latestQuestion: person.sessions[0]?.questions[0]?.text ?? "",
          lastActivity: person.sessions[0]?.lastActivity ?? "",
          unread: person.sessions.reduce((sum, session) => sum + session.unread, 0),
        })),
    };
  });

/** Every session (3-question block) shared with one person, newest first. */
export const getPersonSessions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...identity, personKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships } = await import("@/lib/conversations.server");
    const { loadNote } = await import("@/lib/notes.server");
    const [people, note] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadNote(
        supabaseAdmin as never,
        { guestToken: data.guestToken, profileId: data.profileId },
        data.personKey,
      ),
    ]);
    const person = people.find((p) => p.personKey === data.personKey);
    if (!person) return { name: "", realName: "", note, met: "", sessions: [] };
    const oldest = person.sessions[person.sessions.length - 1];
    const met =
      oldest?.kind === "irl_pair"
        ? "Met in person"
        : oldest?.kind === "group"
          ? "Met in a group session"
          : "Met through a remote invite";
    return {
      name: note.nickname || person.name,
      realName: person.name,
      note,
      met,
      sessions: person.sessions.map((session) => ({
        sessionId: session.sessionId,
        topic: session.topic,
        total: session.total,
        different: session.different,
        messageCount: session.messageCount,
        unread: session.unread,
        lastActivity: session.lastActivity,
      })),
    };
  });

/** The questions inside one shared session, with both answers and thread counts. */
export const getSessionBlock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ ...identity, personKey: z.string().min(1), sessionId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships } = await import("@/lib/conversations.server");
    const { loadNote } = await import("@/lib/notes.server");
    const [people, note] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadNote(
        supabaseAdmin as never,
        { guestToken: data.guestToken, profileId: data.profileId },
        data.personKey,
      ),
    ]);
    const person = people.find((p) => p.personKey === data.personKey);
    const session = person?.sessions.find((s) => s.sessionId === data.sessionId);
    if (!person || !session) return { name: "", topic: "", questions: [] };
    return {
      name: note.nickname || person.name,
      topic: session.topic,
      questions: session.questions,
    };
  });


/**
 * Everyone the person has any tie to, whatever the origin: a remote block, an
 * in-person room, or someone they added during a group session.
 */
export const listPeople = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships, loadConnections } = await import("@/lib/conversations.server");
    const { linkProfileToGuestRows } = await import("@/lib/identity.server");
    const { loadNotes } = await import("@/lib/notes.server");

    await linkProfileToGuestRows(supabaseAdmin as never, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });

    const [shared, connections, notes] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadConnections(supabaseAdmin as never, data.guestToken, data.profileId),
      loadNotes(supabaseAdmin as never, {
        guestToken: data.guestToken,
        profileId: data.profileId,
      }),
    ]);

    /** Plain words for where the two of you first ended up together. */
    const metLabel = (kind: string) => {
      if (kind === "irl_pair") return "Met in person";
      if (kind === "group") return "Met in a group session";
      return "Met through a remote invite";
    };

    type Row = {
      personKey: string;
      name: string;
      nickname: string;
      contact: string;
      note: string;
      sessionCount: number;
      unread: number;
      lastActivity: string;
      met: string;
      sessionsLabel: string;
    };
    const byKey = new Map<string, Row>();

    for (const person of shared) {
      const count = person.sessions.length;
      const oldest = person.sessions[person.sessions.length - 1];
      const note = notes.get(person.personKey);
      byKey.set(person.personKey, {
        personKey: person.personKey,
        name: note?.nickname || person.name,
        nickname: note?.nickname ?? "",
        contact: note?.contact ?? "",
        note: note?.note ?? "",
        sessionCount: count,
        unread: person.sessions.reduce((sum, s) => sum + s.unread, 0),
        lastActivity: person.sessions[0]?.lastActivity ?? "",
        met: metLabel(oldest?.kind ?? "remote"),
        sessionsLabel: count === 1 ? "1 session together" : `${count} sessions together`,
      });
    }

    for (const person of connections) {
      const existing = byKey.get(person.personKey);
      if (existing) {
        if (!existing.lastActivity) existing.lastActivity = person.addedAt;
        continue;
      }
      const note = notes.get(person.personKey);
      byKey.set(person.personKey, {
        personKey: person.personKey,
        name: note?.nickname || person.name,
        nickname: note?.nickname ?? "",
        contact: note?.contact ?? "",
        note: note?.note ?? "",
        sessionCount: 0,
        unread: 0,
        lastActivity: person.addedAt,
        met: "Met in a group session",
        sessionsLabel: "No sessions together yet",
      });
    }

    return {
      people: [...byKey.values()].sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1)),
    };
  });


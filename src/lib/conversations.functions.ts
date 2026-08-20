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

    const [people, waiting] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadPendingInvites(supabaseAdmin as never, data.guestToken, data.profileId),
    ]);

    return {
      waiting,
      people: people
        .filter((person) => person.sessions.some((session) => session.revealed))
        .map((person) => ({
          personKey: person.personKey,
          name: person.name,
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
    const people = await loadRelationships(
      supabaseAdmin as never,
      data.guestToken,
      data.profileId,
    );
    const person = people.find((p) => p.personKey === data.personKey);
    if (!person) return { name: "", sessions: [] };
    return {
      name: person.name,
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
    const people = await loadRelationships(
      supabaseAdmin as never,
      data.guestToken,
      data.profileId,
    );
    const person = people.find((p) => p.personKey === data.personKey);
    const session = person?.sessions.find((s) => s.sessionId === data.sessionId);
    if (!person || !session) return { name: "", topic: "", questions: [] };
    return { name: person.name, topic: session.topic, questions: session.questions };
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

    await linkProfileToGuestRows(supabaseAdmin as never, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });

    const [shared, connections] = await Promise.all([
      loadRelationships(supabaseAdmin as never, data.guestToken, data.profileId),
      loadConnections(supabaseAdmin as never, data.guestToken, data.profileId),
    ]);

    type Row = {
      personKey: string;
      name: string;
      sessionCount: number;
      unread: number;
      lastActivity: string;
      met: string;
    };
    const byKey = new Map<string, Row>();

    for (const person of shared) {
      const count = person.sessions.length;
      byKey.set(person.personKey, {
        personKey: person.personKey,
        name: person.name,
        sessionCount: count,
        unread: person.sessions.reduce((sum, s) => sum + s.unread, 0),
        lastActivity: person.sessions[0]?.lastActivity ?? "",
        met: count === 1 ? "1 session together" : `${count} sessions together`,
      });
    }

    for (const person of connections) {
      const existing = byKey.get(person.personKey);
      if (existing) {
        if (!existing.lastActivity) existing.lastActivity = person.addedAt;
        continue;
      }
      byKey.set(person.personKey, {
        personKey: person.personKey,
        name: person.name,
        sessionCount: 0,
        unread: 0,
        lastActivity: person.addedAt,
        met: "Added in a group session",
      });
    }

    return {
      people: [...byKey.values()].sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1)),
    };
  });

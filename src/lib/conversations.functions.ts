import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const guest = z.string().uuid();
const identity = {
  guestToken: guest,
  profileId: z.string().uuid().optional(),
};

/** Every person you've shared a revealed block with, most recent activity first. */
export const listConversations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships } = await import("@/lib/conversations.server");
    const people = await loadRelationships(
      supabaseAdmin as never,
      data.guestToken,
      data.profileId,
    );
    return {
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

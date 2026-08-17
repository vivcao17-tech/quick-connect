import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const guest = z.string().uuid();

/** Every person you've shared a revealed block with, most recent activity first. */
export const listConversations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ guestToken: guest }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships } = await import("@/lib/conversations.server");
    const people = await loadRelationships(supabaseAdmin as never, data.guestToken);
    return {
      people: people
        .filter((person) => person.blocks.some((block) => block.revealed))
        .map((person) => ({
          personKey: person.personKey,
          name: person.name,
          latestQuestion: person.blocks[0]?.text ?? "",
          lastActivity: person.blocks[0]?.lastActivity ?? "",
          unread: person.blocks.reduce((sum, block) => sum + block.unread, 0),
        })),
    };
  });

/** Every block shared with one person, across all sessions, newest first. */
export const getPersonBlocks = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, personKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadRelationships } = await import("@/lib/conversations.server");
    const people = await loadRelationships(supabaseAdmin as never, data.guestToken);
    const person = people.find((p) => p.personKey === data.personKey);
    if (!person) return { name: "", blocks: [] };
    return { name: person.name, blocks: person.blocks };
  });

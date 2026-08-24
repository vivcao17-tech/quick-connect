import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const identity = {
  guestToken: z.string().uuid(),
  profileId: z.string().uuid().optional(),
};

/** The reader's private note about one person. */
export const getPersonNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...identity, personKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadNote } = await import("@/lib/notes.server");
    return loadNote(
      supabaseAdmin as never,
      { guestToken: data.guestToken, profileId: data.profileId },
      data.personKey,
    );
  });

export const savePersonNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...identity,
        personKey: z.string().min(1),
        nickname: z.string().max(60).default(""),
        contact: z.string().max(200).default(""),
        note: z.string().max(400).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveNote } = await import("@/lib/notes.server");
    return saveNote(
      supabaseAdmin as never,
      { guestToken: data.guestToken, profileId: data.profileId },
      data.personKey,
      { nickname: data.nickname, contact: data.contact, note: data.note },
    );
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Signing in must never cost someone their history. Two bridges:
 *  1. the guest token this browser has been using
 *  2. any session they once saved with the same email address
 * Both get stamped with the new profile id.
 */
export const linkIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ guestToken: z.string().uuid().or(z.literal("")) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileId = context.userId;
    const email =
      typeof context.claims["email"] === "string"
        ? (context.claims["email"] as string).trim().toLowerCase()
        : null;
    const displayName =
      (context.claims["user_metadata"] as Record<string, unknown> | undefined)?.["full_name"] ??
      (context.claims["user_metadata"] as Record<string, unknown> | undefined)?.["name"] ??
      null;

    await supabaseAdmin.from("profiles").upsert(
      {
        id: profileId,
        email,
        ...(typeof displayName === "string" ? { display_name: displayName } : {}),
      },
      { onConflict: "id" },
    );

    let linked = 0;

    if (data.guestToken) {
      const { data: rows } = await supabaseAdmin
        .from("session_participants")
        .update({ profile_id: profileId })
        .eq("guest_token", data.guestToken)
        .is("profile_id", null)
        .select("id");
      linked += rows?.length ?? 0;
    }

    if (email) {
      const { data: byEmail } = await supabaseAdmin
        .from("participant_emails")
        .select("participant_id")
        .eq("email", email);
      const ids = (byEmail ?? []).map((row) => row.participant_id);
      if (ids.length > 0) {
        const { data: rows } = await supabaseAdmin
          .from("session_participants")
          .update({ profile_id: profileId })
          .in("id", ids)
          .is("profile_id", null)
          .select("id");
        linked += rows?.length ?? 0;
      }
    }

    if (linked > 0) {
      await supabaseAdmin.from("events").insert({
        profile_id: profileId,
        ...(data.guestToken ? { guest_token: data.guestToken } : {}),
        name: "identity_linked",
        props: { linked },
      });
    }

    return { ok: true, linked };
  });

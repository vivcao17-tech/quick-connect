import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  byRecency,
  cleanPromptAnswer,
  PROFILE_PROMPTS,
  WALL_PREVIEW_COUNT,
} from "@/lib/profile-shared";
import type { ProfileData } from "@/lib/profile-shared";

const handleShape = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9-]+$/, "Letters, numbers and dashes only");

/** The owner's impression wall. One database round trip, optimized for first paint. */
export const getMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("profile_wall", {
      _profile_id: context.userId,
      _phase: "impressions",
    });
    if (error) throw error;
    const profile = data as unknown as Pick<
      ProfileData,
      "profileId" | "handle" | "displayName" | "impressions" | "curated"
    >;
    return {
      ...profile,
      prompts: [] as ProfileData["prompts"],
      newSince: 0 as number,
      undisplayedNew: 0 as number,
      promptLibrary: PROFILE_PROMPTS,
    };
  });

/** Secondary wall data. It fills in after impression cards have rendered. */
export const getMyProfileDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("profile_wall", {
      _profile_id: context.userId,
      _phase: "details",
    });
    if (error) throw error;
    return data as unknown as Pick<ProfileData, "prompts" | "newSince" | "undisplayedNew">;
  });

/** Just enough for the home page dot: is there something new to look at. */
export const getProfileBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("profile_data", {
      _profile_id: context.userId,
      _include_hidden: true,
    });
    const profile = (data ?? null) as unknown as ProfileData | null;
    return {
      handle: profile?.handle ?? null,
      displayName: profile?.displayName ?? "",
      newSince: profile?.newSince ?? 0,
    };
  });

/**
 * Which of these people have a public wall. Person keys are profile ids for
 * signed-in people; guests simply have no wall yet.
 */
export const getWallLinks = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ personKeys: z.array(z.string()).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const ids = data.personKeys.filter((key) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key),
    );
    if (ids.length === 0) return { walls: {} as Record<string, string> };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id, handle")
      .in("id", ids)
      .not("handle", "is", null);
    const walls: Record<string, string> = {};
    for (const row of rows ?? []) if (row.handle) walls[row.id] = row.handle;
    return { walls };
  });

export const markImpressionsSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ impressions_seen_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true };
  });

export const setProfileHandle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ handle: handleShape }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ handle: data.handle.toLowerCase() })
      .eq("id", context.userId);
    if (error) return { saved: false, reason: "That one's taken." };
    return { saved: true, reason: "" };
  });

export const setImpressionVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ questionId: z.string().uuid(), hidden: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The first visibility change turns an uncurated wall into an explicit
    // selection. Preserve every currently visible question before changing one,
    // so the labels on /me always match what the public wall receives.
    const { count: preferenceCount } = await supabaseAdmin
      .from("profile_impression_prefs")
      .select("question_id", { count: "exact", head: true })
      .eq("profile_id", context.userId);
    if ((preferenceCount ?? 0) === 0) {
      const { data: current } = await supabaseAdmin.rpc("profile_data", {
        _profile_id: context.userId,
        _include_hidden: true,
      });
      const profile = (current ?? null) as unknown as ProfileData | null;
      const initialSelection = (profile?.impressions ?? []).map((impression) => ({
        profile_id: context.userId,
        question_id: impression.questionId,
        hidden: false,
      }));
      if (initialSelection.length > 0) {
        const { error: initialError } = await supabaseAdmin
          .from("profile_impression_prefs")
          .upsert(initialSelection, { onConflict: "profile_id,question_id" });
        if (initialError) throw initialError;
      }
    }

    const { error } = await supabaseAdmin
      .from("profile_impression_prefs")
      .upsert(
        { profile_id: context.userId, question_id: data.questionId, hidden: data.hidden },
        { onConflict: "profile_id,question_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const saveProfilePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        promptKey: z.string().min(1).max(40),
        answer: z.string().max(400),
        visible: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!PROFILE_PROMPTS.some((p) => p.key === data.promptKey)) throw new Error("Unknown prompt");
    const answer = cleanPromptAnswer(data.answer);

    if (!answer) {
      await supabaseAdmin
        .from("profile_prompts")
        .delete()
        .eq("profile_id", context.userId)
        .eq("prompt_key", data.promptKey);
      return { ok: true };
    }

    const { error } = await supabaseAdmin.from("profile_prompts").upsert(
      {
        profile_id: context.userId,
        prompt_key: data.promptKey,
        answer,
        visible: data.visible ?? true,
      },
      { onConflict: "profile_id,prompt_key" },
    );
    if (error) throw error;
    return { ok: true };
  });

/** Anyone with the link. Hidden items never leave the server. */
export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profileId } = await supabaseAdmin.rpc("profile_id_for_handle", {
      _handle: data.handle.toLowerCase(),
    });
    if (!profileId) return null;

    const { data: profile } = await supabaseAdmin.rpc("profile_data", {
      _profile_id: profileId,
      _include_hidden: false,
    });
    const result = (profile ?? null) as unknown as ProfileData | null;
    if (!result) return null;

    // Curated walls publish exactly the owner's picks — nothing auto-inserted.
    const { data: prefs } = await supabaseAdmin
      .from("profile_impression_prefs")
      .select("question_id, hidden")
      .eq("profile_id", profileId);
    const curated = (prefs?.length ?? 0) > 0;
    const selected = new Set((prefs ?? []).filter((p) => !p.hidden).map((p) => p.question_id));

    // Uncurated walls default to the four most recent reads.
    const impressions = curated
      ? result.impressions.filter((i) => selected.has(i.questionId))
      : [...result.impressions].sort(byRecency).slice(0, WALL_PREVIEW_COUNT);

    return {
      handle: result.handle,
      displayName: result.displayName,
      impressions,
      prompts: result.prompts.filter((p) => p.visible),
    };
  });

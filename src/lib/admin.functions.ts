import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Only the addresses listed in ADMIN_EMAILS can read the dashboard. */


export const getAdminMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ windowDays: z.number().int().min(1).max(365).default(30) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const allowed = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const email = String(
      (context.claims as { email?: string } | null)?.email ?? "",
    ).toLowerCase();
    if (!email || !allowed.includes(email)) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readMetrics } = await import("@/lib/admin.server");
    return readMetrics(supabaseAdmin, data.windowDays);
  });

/** Every room in the window, newest first. */
export const getAdminSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ windowDays: z.number().int().min(1).max(365).default(30) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readSessions } = await import("@/lib/admin.server");
    return readSessions(supabaseAdmin, data.windowDays);
  });

/** One room, question by question. */
export const getAdminSessionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readSessionDetail } = await import("@/lib/admin.server");
    return readSessionDetail(supabaseAdmin, data.sessionId);
  });

/** Lifetime per-question averages across every room. */
export const getAdminQuestionAverages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readQuestionAverages } = await import("@/lib/admin.server");
    return readQuestionAverages(supabaseAdmin);
  });

/**
 * Impression questions are judged on mismatch rate, not split: a question
 * everyone guesses right produces no reaction. Also flags people who have
 * seen more than half the impression bank, and how the share links convert.
 */
export const getAdminImpressions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ includeTest: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [questions, exhaustion, events] = await Promise.all([
      supabaseAdmin.rpc("admin_impression_questions", { _include_test: data.includeTest }),
      supabaseAdmin.rpc("admin_impression_exhaustion"),
      supabaseAdmin
        .from("events")
        .select("name, guest_token, profile_id, created_at")
        .in("name", ["profile_view", "profile_cta_tap", "session_created", "impression_fallback"])
        .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()),
    ]);

    const rows = (events.data ?? []) as {
      name: string;
      guest_token: string | null;
      profile_id: string | null;
      created_at: string;
    }[];
    const keyOf = (row: (typeof rows)[number]) => row.profile_id ?? row.guest_token ?? "";
    const viewers = new Set(rows.filter((r) => r.name === "profile_view").map(keyOf));
    const startedAfterView = new Set(
      rows.filter((r) => r.name === "session_created" && viewers.has(keyOf(r))).map(keyOf),
    );

    return {
      questions: (questions.data ?? []) as unknown as {
        questionId: string;
        text: string;
        answers: number;
        mismatches: number;
        mismatchRate: number;
      }[],
      exhaustion: (exhaustion.data ?? []) as unknown as {
        personKey: string;
        name: string;
        seen: number;
        bank: number;
      }[],
      share: {
        views: viewers.size,
        ctaTaps: rows.filter((r) => r.name === "profile_cta_tap").length,
        startedAfterView: startedAfterView.size,
        conversion: viewers.size ? Math.round((startedAfterView.size / viewers.size) * 100) : 0,
      },
      impressionFallbacks: rows.filter((r) => r.name === "impression_fallback").length,
    };
  });

/**
 * A link leaked: give this person a brand-new guest token. Every row keyed by
 * the old token moves to the new one (chain rows included, so nothing about the
 * game changes), outstanding resume links die, and the old token stops working
 * everywhere. Returns a fresh single-use resume link to send the person so their
 * own device picks up the new token (not needed if they can sign in).
 */
export const rotateGuestToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ personKey: z.string().min(8).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { guestPersonKey } = await import("@/lib/conversations.server");
    const { ensureSessionLink } = await import("@/lib/session-link.server");
    const isUuid = /^[0-9a-f-]{36}$/i;

    // Person key is a profile id (rotate every token that account used) or a raw guest token.
    const { data: byProfile } = await supabaseAdmin
      .from("session_participants")
      .select("guest_token")
      .eq("profile_id", isUuid.test(data.personKey) ? data.personKey : "00000000-0000-0000-0000-000000000000")
      .not("guest_token", "is", null);
    const oldTokens = [
      ...new Set(
        (byProfile ?? []).length > 0
          ? (byProfile ?? []).map((row) => row.guest_token as string)
          : [data.personKey],
      ),
    ];

    let rotated = 0;
    let resumePath: string | null = null;
    for (const oldToken of oldTokens) {
      const { data: rows } = await supabaseAdmin
        .from("session_participants")
        .select("id, session_id, joined_at")
        .eq("guest_token", oldToken)
        .order("joined_at", { ascending: false });
      if (!rows || rows.length === 0) continue;
      const fresh = crypto.randomUUID();
      const ids = rows.map((row) => row.id);

      await supabaseAdmin.from("session_participants").update({ guest_token: fresh }).eq("guest_token", oldToken);
      await supabaseAdmin.from("events").update({ guest_token: fresh }).eq("guest_token", oldToken);
      await supabaseAdmin.from("person_notes").update({ owner_key: fresh }).eq("owner_key", oldToken);
      await supabaseAdmin
        .from("person_notes")
        .update({ target_key: guestPersonKey(fresh) })
        .eq("target_key", guestPersonKey(oldToken));
      await supabaseAdmin.from("chain_answers").update({ person_key: fresh }).eq("person_key", oldToken);
      await supabaseAdmin.from("chain_guesses").update({ guesser_key: fresh }).eq("guesser_key", oldToken);
      await supabaseAdmin.from("chain_guesses").update({ subject_key: fresh }).eq("subject_key", oldToken);
      await supabaseAdmin
        .from("excluded_identities")
        .update({ value: fresh })
        .eq("kind", "guest_token")
        .eq("value", oldToken);
      await supabaseAdmin
        .from("session_links")
        .update({ used_at: new Date().toISOString() })
        .in("participant_id", ids)
        .is("used_at", null);

      rotated += 1;
      if (!resumePath && rows[0]) {
        const token = await ensureSessionLink(supabaseAdmin, {
          sessionId: rows[0].session_id,
          participantId: rows[0].id,
        });
        resumePath = `/s/${token}`;
      }
    }
    return { rotated, resumePath };
  });

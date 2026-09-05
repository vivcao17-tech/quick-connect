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

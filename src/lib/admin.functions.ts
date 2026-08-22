import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { claims: unknown }) {
  const allowed = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const email = String((context.claims as { email?: string } | null)?.email ?? "").toLowerCase();
  if (!email || !allowed.includes(email)) throw new Error("Not allowed");
}

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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readSessions } = await import("@/lib/admin.server");
    return readSessions(supabaseAdmin, data.windowDays);
  });

/** One room, question by question. */
export const getAdminSessionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readSessionDetail } = await import("@/lib/admin.server");
    return readSessionDetail(supabaseAdmin, data.sessionId);
  });

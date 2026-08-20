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

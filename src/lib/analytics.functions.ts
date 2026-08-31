import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Every report below is gated server-side on ADMIN_EMAILS (exact match,
 * case-insensitive, trimmed). The route guard is only cosmetic.
 */

const rangeSchema = z.object({
  from: z.string(),
  to: z.string(),
  includeTest: z.boolean().default(false),
});

async function admin(claims: unknown) {
  const { assertAdmin } = await import("@/lib/admin.server");
  assertAdmin(claims);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readOverview } = await import("@/lib/analytics.server");
    return readOverview(db, data);
  });

export const getFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    rangeSchema.extend({ segment: z.enum(["none", "note", "mode", "week"]).default("none") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readFunnel } = await import("@/lib/analytics.server");
    return readFunnel(db, data, data.segment);
  });

export const getCohorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        activity: z.enum(["open", "answer", "message", "session"]).default("answer"),
        includeTest: z.boolean().default(false),
        weeks: z.number().int().min(2).max(52).default(12),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readCohorts } = await import("@/lib/analytics.server");
    return readCohorts(db, data.activity, data.includeTest, data.weeks);
  });

export const getPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().default(""), includeTest: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readPeople } = await import("@/lib/analytics.server");
    return readPeople(db, data.q, data.includeTest);
  });

export const getPersonTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ personKey: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readPersonTimeline } = await import("@/lib/analytics.server");
    return readPersonTimeline(db, data.personKey);
  });

export const getQuestionPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ includeTest: z.boolean().default(false) }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readQuestionPerformance } = await import("@/lib/analytics.server");
    return readQuestionPerformance(db, data.includeTest);
  });

export const getSessionRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readSessionRows } = await import("@/lib/analytics.server");
    return readSessionRows(db, data);
  });

export const getInviteReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readInvites } = await import("@/lib/analytics.server");
    return readInvites(db, data);
  });

export const getNotificationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { readNotifications } = await import("@/lib/analytics.server");
    return readNotifications(db, data);
  });

export const markSessionTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ sessionId: z.string().uuid(), isTest: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await admin(context.claims);
    const { setSessionTest } = await import("@/lib/analytics.server");
    return setSessionTest(db, data.sessionId, data.isTest);
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CLIENT_EVENTS = [
  "guess_link_opened",
  "guess_started",
  "own_card_cta_shown",
  "own_card_cta_clicked",
  "share_link_copied",
  "followup_tapped",
  "home_viewed",
  "example_viewed",
  "know_started",
  "know_question_answered",
  "card_link_shown",
  "guess_question_answered",
  "results_viewed",
  "tag_expanded",
  "sign_in_completed",
] as const;

/** Browser-reported events. The card is resolved from its public token server-side. */
export const logClientCardEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        event: z.enum(CLIENT_EVENTS),
        token: z.string().min(6).max(40).optional(),
        guestToken: z.string().uuid().optional(),
        profileId: z.string().uuid().optional(),
        meta: z.object({ question_index: z.number().int().min(1).max(5).optional(), method: z.enum(["copy", "share"]).optional(), page: z.enum(["know", "weekly"]).optional(), guesser: z.string().max(40).optional(), question_key: z.string().max(100).optional() }).strip().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { logCardEvent } = await import("@/lib/card-events.server");
      let cardId: string | null = null;
      if (data.token) {
        const { data: card } = await db.from("impression_cards").select("id").eq("token", data.token).maybeSingle();
        cardId = card?.id ?? null;
      }
      await logCardEvent(db, {
        event: data.event,
        card_id: cardId,
        guest_token: data.guestToken ?? null,
        user_id: data.profileId ?? null,
        meta: data.meta ?? null,
      });
    } catch {
      // never surface
    }
    return { ok: true };
  });

type Rate = { label: string; num: number; den: number };

/** Admin only: session-based card funnel + latest 100 events. */
export const getCardEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: recent }, { data: all }] = await Promise.all([
      db.from("card_events").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("card_events").select("event, card_id, guest_token, user_id").limit(50000),
    ]);
    const rows = all ?? [];
    // One "session" = one person (guest token, else user) on one card.
    const sessions = (event: string) =>
      new Set(
        rows
          .filter((r) => r.event === event)
          .map((r) => `${r.card_id ?? r.user_id ?? "-"}|${r.guest_token ?? r.user_id ?? "-"}`),
      ).size;
    const ownerCards = (event: string) =>
      new Set(rows.filter((r) => r.event === event).map((r) => r.card_id ?? r.user_id ?? r.guest_token)).size;

    const opened = sessions("guess_link_opened");
    const started = sessions("guess_started");
    const completed = sessions("guess_completed");
    const ctaShown = sessions("own_card_cta_shown");
    const ctaClicked = sessions("own_card_cta_clicked");
    const created = rows.filter((r) => r.event === "card_created").length;
    const shared = ownerCards("share_link_copied");
    const followups = ownerCards("followup_tapped");

    const funnel: Rate[] = [
      { label: "Link opened → started", num: started, den: opened },
      { label: "Started → completed", num: completed, den: started },
      { label: "Completed (reveal) → owner follow-up", num: followups, den: completed },
      { label: "CTA shown → clicked", num: ctaClicked, den: ctaShown },
      { label: "Card created → link shared", num: shared, den: created },
    ];
    const counts = { opened, started, completed, ctaShown, ctaClicked, created, shared, followups };

    const cardIds = [...new Set((recent ?? []).map((r) => r.card_id).filter(Boolean))] as string[];
    const { data: cards } = cardIds.length
      ? await db.from("impression_cards").select("id, token, subject_name").in("id", cardIds)
      : { data: [] as { id: string; token: string; subject_name: string }[] };
    const byId = new Map((cards ?? []).map((c) => [c.id, c]));

    return {
      funnel,
      counts,
      recent: (recent ?? []).map((r) => ({
        id: r.id,
        event: r.event,
        at: r.created_at,
        card: r.card_id ? `${byId.get(r.card_id)?.subject_name ?? "?"} · ${byId.get(r.card_id)?.token ?? r.card_id.slice(0, 8)}` : null,
        guest: r.guest_token ? r.guest_token.slice(0, 8) : null,
        user: r.user_id ? r.user_id.slice(0, 8) : null,
        identityEventId: r.id,
        identityKind: r.user_id ? "user" as const : r.guest_token ? "guest" as const : null,
        meta: r.meta,
      })),
    };
  });

/** Search identifiers server-side; only opaque event ids are used for navigation. */
export const searchCardIdentities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().trim().min(4).max(36).regex(/^[a-f0-9-]+$/i) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const digits = data.query.replace(/-/g, "").toLowerCase();
    const uuid = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    const lower = uuid(digits.padEnd(32, "0").slice(0, 32));
    const upper = uuid(digits.padEnd(32, "f").slice(0, 32));
    const [{ data: guests, error: guestError }, { data: users, error: userError }] = await Promise.all([
      db.from("card_events").select("id, guest_token, user_id, created_at").like("guest_token", `${data.query}%`).order("created_at", { ascending: false }).limit(100),
      db.from("card_events").select("id, guest_token, user_id, created_at").gte("user_id", lower).lte("user_id", upper).order("created_at", { ascending: false }).limit(100),
    ]);
    if (guestError || userError) throw guestError ?? userError;
    const unique = new Map<string, { id: string; kind: "guest" | "user"; identifier: string }>();
    for (const row of guests ?? []) if (row.guest_token && !unique.has(`guest:${row.guest_token}`)) unique.set(`guest:${row.guest_token}`, { id: row.id, kind: "guest", identifier: row.guest_token });
    for (const row of users ?? []) if (row.user_id && !unique.has(`user:${row.user_id}`)) unique.set(`user:${row.user_id}`, { id: row.id, kind: "user", identifier: row.user_id });
    return [...unique.values()].slice(0, 30);
  });

/** Admin-only raw event history. The URL contains an event id, never a guest token. */
export const getCardIdentityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid(), kind: z.enum(["guest", "user"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    assertAdmin(context.claims);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: anchor, error: anchorError } = await db.from("card_events").select("guest_token, user_id").eq("id", data.eventId).maybeSingle();
    if (anchorError) throw anchorError;
    const identifier = data.kind === "guest" ? anchor?.guest_token : anchor?.user_id;
    if (!identifier) return null;
    const { data: events, error } = await db.from("card_events").select("id, event, created_at, card_id, guest_token, user_id, meta")
      .eq(data.kind === "guest" ? "guest_token" : "user_id", identifier).order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, 9999);
    if (error) throw error;
    const cardIds = [...new Set((events ?? []).map((row) => row.card_id).filter((id): id is string => Boolean(id)))];
    const { data: cards, error: cardsError } = cardIds.length
      ? await db.from("impression_cards").select("id, subject_name, token").in("id", cardIds)
      : { data: [], error: null };
    if (cardsError) throw cardsError;
    const cardMap = new Map((cards ?? []).map((card) => [card.id, `${card.subject_name} · ${card.token}`]));
    const names = data.kind === "guest" ? await db.from("impression_guesses").select("guesser_display_name").eq("guesser_session_id", identifier).order("created_at", { ascending: false }).limit(1) : null;
    const profile = data.kind === "user" ? await db.from("profiles").select("display_name").eq("id", identifier).maybeSingle() : null;
    return {
      kind: data.kind,
      identifier,
      name: data.kind === "guest" ? names?.data?.[0]?.guesser_display_name ?? null : profile?.data?.display_name ?? null,
      events: (events ?? []).map((row) => ({ id: row.id, event: row.event, at: row.created_at, card: row.card_id ? cardMap.get(row.card_id) ?? row.card_id : null, meta: row.meta })),
    };
  });

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
        meta: z.record(z.string(), z.unknown()).optional(),
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
        meta: r.meta,
      })),
    };
  });

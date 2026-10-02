type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type CardEventRow = {
  event: string;
  card_id?: string | null;
  guest_token?: string | null;
  user_id?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Fire and forget: never throws, never blocks the user's action for long. */
export async function logCardEvent(db: Admin, row: CardEventRow) {
  try {
    await db.from("card_events").insert({
      event: row.event,
      card_id: row.card_id ?? null,
      guest_token: row.guest_token ?? null,
      user_id: row.user_id ?? null,
      meta: (row.meta ?? null) as never,
    });
  } catch {
    // logging must never break the product
  }
}

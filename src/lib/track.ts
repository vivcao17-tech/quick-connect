/**
 * Product analytics, client side.
 *
 * One row per thing that happened, written straight into `events` (the table
 * allows anonymous inserts by design). Never blocks the UI and never throws:
 * a failed insert must not cost someone their answer.
 */

import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";

export type TrackContext = {
  sessionId?: string | null;
  participantId?: string | null;
  profileId?: string | null;
};

export function track(
  name: string,
  props: Record<string, unknown> = {},
  ctx: TrackContext = {},
): void {
  if (typeof window === "undefined") return;
  const row = {
    name,
    props: props as never,
    guest_token: getGuestToken() || null,
    session_id: ctx.sessionId ?? null,
    participant_id: ctx.participantId ?? null,
    profile_id: ctx.profileId ?? null,
  };
  void supabase
    .from("events")
    .insert(row as never)
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Return-visit tracking. Records the gap since this browser's previous visit
 * to the same thing, which is what makes the cohort curves readable.
 */
const VISIT_KEY = "nosure.last_visit";

export function trackVisit(key: string, ctx: TrackContext = {}, extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  let previous: number | null = null;
  try {
    const raw = window.localStorage.getItem(`${VISIT_KEY}:${key}`);
    previous = raw ? Number(raw) : null;
    window.localStorage.setItem(`${VISIT_KEY}:${key}`, String(Date.now()));
  } catch {
    previous = null;
  }
  track(
    "session_opened",
    {
      ...extra,
      key,
      seconds_since_previous: previous ? Math.round((Date.now() - previous) / 1000) : null,
      first_visit: previous === null,
    },
    ctx,
  );
}

/** Seconds spent on a screen, reported when the component goes away. */
export function dwellTimer(name: string, props: Record<string, unknown>, ctx: TrackContext = {}) {
  const startedAt = Date.now();
  return () => track(name, { ...props, seconds: Math.round((Date.now() - startedAt) / 1000) }, ctx);
}

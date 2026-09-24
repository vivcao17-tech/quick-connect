import { createMiddleware } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type LocalSession = { accessToken?: string; email?: string; userId?: string };

/**
 * Read the sign-in from the browser without ever throwing.
 *
 * The auth server can reject a stored token outright — for example when the
 * device clock is behind the moment the token was issued, so the token looks
 * like it was "issued in the future". That must not take the page down: we try
 * once for a fresh token and otherwise carry on as a guest, whose history is
 * keyed by the browser token and stays reachable.
 */
export async function readLocalSession(): Promise<LocalSession> {
  let session: Session | null = null;
  let failed = false;

  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    failed = true;
  }

  // Only chase a new token when the read itself broke. No stored session at all
  // means genuinely signed out, so there is nothing to refresh.
  if (!session && failed) {
    try {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    } catch {
      session = null;
    }
  }

  if (!session) return {};
  return {
    accessToken: session.access_token,
    email: session.user?.email ?? undefined,
    userId: session.user?.id,
  };
}

/**
 * Same job as the generated bearer attacher — put the sign-in token on every
 * app request — but a broken session sends the request unsigned instead of
 * rejecting the call.
 */
export const attachSupabaseAuthSafe = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { accessToken } = await readLocalSession();
    return next({ headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  },
);

import { useEffect, useState } from "react";

import { readLocalSession } from "@/lib/auth-session";
import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";

export type Viewer = { guestToken: string; profileId?: string | undefined; ready: boolean };

/**
 * Who is looking. Guests are keyed by their browser token; a signed-in person is
 * also keyed by profile_id so their history follows them onto any device.
 */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>({ guestToken: "", ready: false });

  useEffect(() => {
    let alive = true;
    const guestToken = getGuestToken();
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (alive) setViewer({ guestToken, profileId: data.user?.id, ready: true });
      })
      .catch(() => {
        if (alive) setViewer({ guestToken, ready: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  return viewer;
}

/**
 * Same identity as useViewer, but read from the locally stored session instead
 * of asking the auth server. Lets pages start their data fetch immediately.
 */
export async function readLocalViewer(): Promise<{ guestToken: string; profileId?: string }> {
  const guestToken = getGuestToken();
  const { userId } = await readLocalSession();
  return userId ? { guestToken, profileId: userId } : { guestToken };
}

import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";

export type Viewer = { guestToken: string; profileId?: string; ready: boolean };

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

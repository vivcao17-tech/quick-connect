import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getGuestToken } from "@/lib/guest";
import { linkIdentity } from "@/lib/link-identity.functions";

/**
 * Runs once wherever the app is mounted: if someone is (or becomes) signed in,
 * their guest history and any email-saved sessions are attached to the profile.
 */
export function useLinkIdentity(): void {
  const link = useServerFn(linkIdentity);

  useEffect(() => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      void link({ data: { guestToken: getGuestToken() } }).catch(() => undefined);
    };

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) run();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session) run();
      if (event === "SIGNED_OUT") done = false;
    });

    return () => sub.subscription.unsubscribe();
  }, [link]);
}

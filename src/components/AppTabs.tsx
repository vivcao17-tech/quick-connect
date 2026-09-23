import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, UserRound, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getChainWeek } from "@/lib/chain.functions";
import { useViewer } from "@/lib/viewer";

const tabs = [
  { label: "People", to: "/people" as const, icon: UsersRound },
  { label: "This week", to: "/chain" as const, icon: CalendarDays },
  { label: "You", to: "/me" as const, icon: UserRound },
  { label: "Meet", to: "/meet" as const, icon: MapPin },
];

export function AppTabs() {
  const viewer = useViewer();
  const loadWeek = useServerFn(getChainWeek);
  const [weekNeedsAnswer, setWeekNeedsAnswer] = useState(false);

  const refreshWeek = useCallback(() => {
    if (!viewer.ready || !viewer.profileId || !viewer.guestToken) return;
    void loadWeek({ data: { guestToken: viewer.guestToken, profileId: viewer.profileId } })
      .then((result) => setWeekNeedsAnswer(Boolean(result.week?.open && !result.mine)))
      .catch(() => setWeekNeedsAnswer(false));
  }, [loadWeek, viewer.guestToken, viewer.profileId, viewer.ready]);

  useEffect(refreshWeek, [refreshWeek]);

  useEffect(() => {
    const answered = () => setWeekNeedsAnswer(false);
    window.addEventListener("nosure:chain-answered", answered);
    return () => window.removeEventListener("nosure:chain-answered", answered);
  }, []);

  if (!viewer.ready || !viewer.profileId) return null;

  return (
    <nav
      aria-label="Main tabs"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm"
    >
      <div className="mx-auto grid max-w-xl grid-cols-4 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <span className="relative">
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              {to === "/chain" && weekNeedsAnswer && (
                <span
                  aria-label="New weekly question"
                  className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-primary"
                />
              )}
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

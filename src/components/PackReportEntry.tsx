import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getOwnPackReport } from "@/lib/pack-report.functions";
import type { ReportPack } from "@/lib/pack-report";

/** Personal report progress is separate from the pair's pack unlock. */
export function PackReportEntry({ pack, guestToken, profileId }: {
  pack: ReportPack;
  guestToken: string;
  profileId?: string | undefined;
}) {
  const load = useServerFn(getOwnPackReport);
  const [answered, setAnswered] = useState<number | null>(null);
  useEffect(() => {
    if (!guestToken) return;
    let live = true;
    void load({ data: { pack, guestToken, ...(profileId ? { profileId } : {}) } })
      .then((report) => { if (live) setAnswered(report.answered); })
      .catch(() => { if (live) setAnswered(null); });
    return () => { live = false; };
  }, [guestToken, load, pack, profileId]);

  return (
    <div className="border-t border-border px-6 py-3">
      {answered !== null && answered >= 4 ? (
        <Link to="/pack/$packKey/report" params={{ packKey: pack }} className="text-sm text-primary underline underline-offset-4">
          Your read on this pack →
        </Link>
      ) : (
        <>
          <span className="text-sm text-muted-foreground" aria-disabled="true">Your read on this pack →</span>
          {answered !== null && <p className="mt-1 text-xs text-muted-foreground">Answer {4 - answered} more to unlock.</p>}
        </>
      )}
    </div>
  );
}
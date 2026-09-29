import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { fillName } from "@/components/QuestionText";
import { PackReportEntry } from "@/components/PackReportEntry";
import { getPairPreview } from "@/lib/packs.functions";
import type { Pack } from "@/lib/packs";
import { roundsToUnlock } from "@/lib/packs";

type Preview = Awaited<ReturnType<typeof getPairPreview>>;

/**
 * What the two of you have built up, pack by pack. Locked packs show how many
 * more questions the pair needs; unlocked packs show the answers themselves.
 */
export function PackPreview({
  guestToken,
  profileId,
  personKey,
  name,
}: {
  guestToken: string;
  profileId?: string | undefined;
  personKey: string;
  name: string;
}) {
  const load = useServerFn(getPairPreview);
  const [data, setData] = useState<Preview | null>(null);
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    if (!guestToken) return;
    void load({
      data: { guestToken, personKey, ...(profileId ? { profileId } : {}) },
    })
      .then(setData)
      .catch(() => setData(null));
  }, [load, guestToken, profileId, personKey]);

  if (!data) return null;
  const anotherUnlocked = data.packs.some((pack) => pack.pack !== "clash" && pack.unlocked);

  return (
    <div className="mt-12">
      <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
        Your preview with {name}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {data.packs.map((pack) => {
          const expanded = open === pack.pack;
          return (
            <section key={pack.pack} className="card-soft px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xl leading-tight">
                    {pack.unlocked ? pack.readTitle : pack.label}
                  </p>
                  {!pack.unlocked && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {roundsToUnlock(pack, anotherUnlocked)}
                    </p>
                  )}
                </div>
                {pack.unlocked ? (
                  <button
                    onClick={() => setOpen(expanded ? "" : pack.pack)}
                    className="shrink-0 text-sm text-muted-foreground underline underline-offset-4"
                  >
                    {expanded ? "Close" : "Read"}
                  </button>
                ) : (
                  <Link
                    to="/remote"
                    search={{ pack: pack.pack, person: personKey }}
                    className="shrink-0 text-sm text-primary underline underline-offset-4"
                  >
                    Play
                  </Link>
                )}
              </div>

              {expanded && (
                <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
                  {pack.items.map((item) => (
                    <div key={item.sessionQuestionId}>
                      <p className="text-base leading-snug">{fillName(item.text, name)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        You: {item.myLabel}
                        {item.myReason ? ` — "${item.myReason}"` : ""}
                      </p>
                      <p
                        className={`text-sm ${item.matched ? "text-muted-foreground" : "text-primary"}`}
                      >
                        {name}: {item.theirLabel}
                        {item.theirReason ? ` — "${item.theirReason}"` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {pack.pack !== "clash" && <div className="-mx-6 -mb-5 mt-5"><PackReportEntry pack={pack.pack} guestToken={guestToken} profileId={profileId} /></div>}
            </section>
          );
        })}
      </div>

      <PackBridge pack={data.next} name={name} />
    </div>
  );
}

/** Every reveal ends pointing at the next round in the pack the pair is closest to. */
export function PackBridge({ pack, name }: { pack: Pack; name: string }) {
  const label: Record<Pack, string> = {
    click: `Ask ${name} two more from Click`,
    talk: `Ask ${name} two more from Talk`,
    bring_out: `Ask ${name} two more from Bring out`,
    clash: `Ask ${name} two more from Clash`,
  };
  return (
    <Link
      to="/remote"
      search={{ pack }}
      className="mt-6 block rounded-2xl border-2 border-primary px-6 py-5 text-center text-xl text-primary"
    >
      {label[pack]}
    </Link>
  );
}

/** The bridge alone, for reveal pages: one tap into the pair's next round. */
export function NextPackBridge({
  guestToken,
  profileId,
  personKey,
  name,
}: {
  guestToken: string;
  profileId?: string | undefined;
  personKey: string;
  name: string;
}) {
  const load = useServerFn(getPairPreview);
  const [next, setNext] = useState<Pack | null>(null);

  useEffect(() => {
    if (!guestToken) return;
    void load({ data: { guestToken, personKey, ...(profileId ? { profileId } : {}) } })
      .then((result) => setNext(result.next))
      .catch(() => setNext(null));
  }, [load, guestToken, profileId, personKey]);

  if (!next) return null;
  const label: Record<Pack, string> = {
    click: `Ask ${name} two more from Click`,
    talk: `Ask ${name} two more from Talk`,
    bring_out: `Ask ${name} two more from Bring out`,
    clash: `Ask ${name} two more from Clash`,
  };
  return (
    <Link
      to="/remote"
      search={{ pack: next, person: personKey }}
      className="mt-6 block rounded-2xl border-2 border-primary px-6 py-5 text-center text-xl text-primary"
    >
      {label[next]}
    </Link>
  );
}

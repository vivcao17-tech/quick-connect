/**
 * End-of-room tracking.
 *
 * Two moments, once per person per room:
 *  - `end_screen_shown`  — this phone actually landed on the closing screen.
 *  - `save_prompt_shown` — the save step was on screen, not just in the DOM
 *                          five scrolls further down.
 *
 * Without the second one, "0% capture" is unreadable: it can't tell a room
 * where everyone declined from a room where nobody ever saw the ask.
 */

import { useCallback, useEffect, useRef } from "react";

import { track } from "@/lib/track";

export type EndKind = "group" | "irl_pair" | "remote" | "group_async";

type Ctx = { sessionId?: string | null; participantId?: string | null };

export function useEndScreenTracking(kind: EndKind, active: boolean, ctx: Ctx = {}) {
  const sessionId = ctx.sessionId ?? null;
  const participantId = ctx.participantId ?? null;
  const endLogged = useRef(false);
  const promptLogged = useRef(false);
  const observed = useRef(false);

  useEffect(() => {
    if (!active || endLogged.current) return;
    endLogged.current = true;
    track("end_screen_shown", { kind }, { sessionId, participantId });
  }, [active, kind, sessionId, participantId]);

  /** Attach to the save block: `<div ref={saveRef}>`. */
  const saveRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || observed.current || promptLogged.current) return;
      observed.current = true;

      const fire = () => {
        if (promptLogged.current) return;
        promptLogged.current = true;
        track("save_prompt_shown", { kind }, { sessionId, participantId });
      };

      if (typeof IntersectionObserver === "undefined") {
        fire();
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            fire();
            observer.disconnect();
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(node);
    },
    [kind, sessionId, participantId],
  );

  return saveRef;
}

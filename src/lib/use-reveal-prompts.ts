import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getRevealPrompts } from "@/lib/ai-prompts.functions";
import type { RevealPrompts } from "@/lib/ai-prompts.functions";

const EMPTY: RevealPrompts = { source: "template", observation: "", prompts: [] };

/**
 * Fetches the cached AI discussion prompts for one revealed session_question.
 * Never runs before reveal: there is nothing to compare until both sides answered.
 * Generation and caching happen server-side, so both participants read the same set.
 */
export function useRevealPrompts(
  guestToken: string,
  sessionQuestionId: string,
  revealed: boolean,
): RevealPrompts {
  const fetchPrompts = useServerFn(getRevealPrompts);
  const [byId, setById] = useState<Record<string, RevealPrompts>>({});

  useEffect(() => {
    if (!guestToken || !sessionQuestionId || !revealed || byId[sessionQuestionId]) return;
    let alive = true;
    void fetchPrompts({ data: { guestToken, sessionQuestionId } })
      .then((result) => {
        if (alive && result.source === "ai" && result.prompts.length > 0) {
          setById((prev) => ({ ...prev, [sessionQuestionId]: result }));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [guestToken, sessionQuestionId, revealed, byId, fetchPrompts]);

  return byId[sessionQuestionId] ?? EMPTY;
}

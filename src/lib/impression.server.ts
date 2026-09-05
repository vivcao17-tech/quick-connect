import { pickImpressionQuestion } from "@/lib/irl-helpers";
import type { QuestionRow } from "@/lib/irl-helpers";
import { impressionStem } from "@/components/QuestionText";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/**
 * The question that closes every session. If this person has already seen the
 * whole impression bank we fall back to an ordinary question rather than block
 * the room — and record that it happened so the drain rate is visible.
 */
export async function closingImpression(
  admin: Admin,
  opts: {
    excludeIds: string[];
    sessionId?: string | undefined;
    guestTokens?: (string | null)[] | undefined;
    profileIds?: (string | null)[] | undefined;
  },
): Promise<QuestionRow | null> {
  const row = await pickImpressionQuestion(admin, opts.excludeIds, {
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts.guestTokens ? { guestTokens: opts.guestTokens } : {}),
    ...(opts.profileIds ? { profileIds: opts.profileIds } : {}),
  });
  if (!row) {
    await admin.from("events").insert({
      ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
      name: "impression_fallback",
      props: { reason: "impression_bank_empty" },
    });
  }
  return row;
}

export type ImpressionTarget = {
  participantId: string;
  name: string;
  stem: string;
  guessed: OptionKey | null;
};

/** The stem this person reads when guessing about someone in the room. */
export function stemForTarget(snap: Snapshot, name: string) {
  return impressionStem(
    { text: snap.text, stemOther: snap.stemOther ?? null, stemSelf: snap.stemSelf ?? null },
    "other",
    name,
  );
}

export function selfStem(snap: Snapshot) {
  return impressionStem(
    { text: snap.text, stemOther: snap.stemOther ?? null, stemSelf: snap.stemSelf ?? null },
    "self",
  );
}

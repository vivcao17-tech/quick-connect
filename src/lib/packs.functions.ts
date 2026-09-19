import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isPack } from "@/lib/packs";

const guest = z.string().min(8).max(64);
const packInput = z.enum(["click", "talk", "bring_out", "clash"]);

/** The questions one person chooses from for the next round. */
export const listPackCandidates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        pack: packInput.optional(),
        guestToken: guest.optional(),
        profileId: z.string().uuid().optional(),
        count: z.number().int().min(2).max(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { packCandidates } = await import("@/lib/packs.server");
    const result = await packCandidates(supabaseAdmin, {
      ...(data.pack ? { pack: data.pack } : {}),
      ...(data.guestToken ? { guestTokens: [data.guestToken] } : {}),
      ...(data.profileId ? { profileIds: [data.profileId] } : {}),
      count: data.count ?? 4,
    });
    return {
      pack: result.pack,
      label: result.label,
      questions: result.questions.map((q) => ({
        id: q.id,
        questionType: q.questionType,
        ...q.snapshot,
      })),
      impressions: result.impressions.map((q) => ({
        id: q.id,
        questionType: q.questionType,
        ...q.snapshot,
      })),
    };
  });

/** What the two of you have built up so far, pack by pack. */
export const getPairPreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        personKey: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDetail } = await import("@/lib/relationships.server");
    const { packPreview, nextPack } = await import("@/lib/packs.server");

    const detail = await loadDetail(
      supabaseAdmin,
      data.guestToken,
      ...(data.profileId ? ([data.profileId] as const) : ([] as const)),
    );
    const person = detail.people.find((p) => p.personKey === data.personKey);

    const seen = new Set<string>();
    const questions = (person?.sessions ?? []).flatMap((session) =>
      session.questions
        .filter((q) => (seen.has(q.sessionQuestionId) ? false : seen.add(q.sessionQuestionId)))
        .map((q) => ({
          sessionId: q.sessionId,
          sessionQuestionId: q.sessionQuestionId,
          questionId: q.questionId,
          text: q.text,
          revealed: q.revealed,
          myLabel: q.myLabel,
          theirLabel: q.theirLabel,
          myReason: q.myReason,
          theirReason: q.theirReason,
          matched: q.matched,
        })),
    );

    const packs = await packPreview(supabaseAdmin, questions);
    return { name: person?.nickname || person?.name || "", packs, next: nextPack(packs) };
  });

export { isPack };

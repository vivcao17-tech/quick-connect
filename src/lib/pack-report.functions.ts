import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { summarizePackAnswers } from "@/lib/pack-report";

const input = z.object({
  guestToken: z.string().uuid(),
  profileId: z.string().uuid().optional(),
  pack: z.enum(["click", "talk", "bring_out"]),
});

/** Only the caller's own A/B answers, across the participant rows they own. */
export const getOwnPackReport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipants } = await import("@/lib/identity.server");
    const participants = await myParticipants(supabaseAdmin, data);
    if (!participants.length) return summarizePackAnswers(data.pack, []);

    const { data: answers, error } = await supabaseAdmin
      .from("answers")
      .select("question_id, option_key, created_at")
      .in("participant_id", participants.map((row) => row.id))
      .eq("answer_role", "about_self")
      .in("option_key", ["a", "b"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    const questionIds = [...new Set((answers ?? []).map((row) => row.question_id))];
    if (!questionIds.length) return summarizePackAnswers(data.pack, []);

    const { data: questions, error: questionError } = await supabaseAdmin
      .from("questions")
      .select("id, question_key, report_axis, pack, question_type")
      .in("id", questionIds)
      .eq("pack", data.pack)
      .in("question_type", ["ab", "ab_reason"]);
    if (questionError) throw questionError;
    const bank = new Map((questions ?? []).map((question) => [question.id, question]));
    return summarizePackAnswers(data.pack, (answers ?? []).flatMap((answer) => {
      const question = bank.get(answer.question_id);
      return question ? [{ questionId: question.id, questionKey: question.question_key, axis: question.report_axis, optionKey: answer.option_key }] : [];
    }));
  });
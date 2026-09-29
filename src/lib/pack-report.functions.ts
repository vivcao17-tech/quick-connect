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

    const participantIds = participants.map((row) => row.id);
    const allAnswers = [] as { question_id: string; option_key: string }[];
    // Page in chunks so a long history cannot silently lose older answered questions.
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await supabaseAdmin
        .from("answers")
        .select("question_id, option_key, created_at")
        .in("participant_id", participantIds)
        .eq("answer_role", "about_self")
        .in("option_key", ["a", "b"])
        .order("created_at", { ascending: false })
        .range(offset, offset + 499);
      if (error) throw error;
      allAnswers.push(...(page ?? []));
      if (!page || page.length < 500) break;
    }
    const questionIds = [...new Set(allAnswers.map((row) => row.question_id))];
    if (!questionIds.length) return summarizePackAnswers(data.pack, []);

    type Question = { id: string; question_key: string | null; report_axis: string | null };
    const questions: Question[] = [];
    for (let offset = 0; offset < questionIds.length; offset += 200) {
      const { data: page, error: questionError } = await supabaseAdmin
        .from("questions")
        .select("id, question_key, report_axis")
        .in("id", questionIds.slice(offset, offset + 200))
        .eq("pack", data.pack)
        .in("question_type", ["ab", "ab_reason"]);
      if (questionError) throw questionError;
      questions.push(...(page ?? []));
    }
    const bank = new Map(questions.map((question) => [question.id, question]));
    return summarizePackAnswers(data.pack, allAnswers.flatMap((answer) => {
      const question = bank.get(answer.question_id);
      return question ? [{ questionId: question.id, questionKey: question.question_key, axis: question.report_axis, optionKey: answer.option_key }] : [];
    }));
  });
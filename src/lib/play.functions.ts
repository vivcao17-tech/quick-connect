import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const startSchema = z.object({
  guestToken: z.string().uuid(),
  displayName: z.string().max(60).optional(),
  topicSlug: z.string().min(1).max(60),
  spiceMax: z.number().int().min(1).max(3).optional(),
});

const answerSchema = z.object({
  guestToken: z.string().uuid(),
  sessionQuestionId: z.string().uuid(),
  optionKey: z.enum(["a", "b", "c"]),
  reasonText: z.string().max(500).optional(),
  reasonChipId: z.string().uuid().optional(),
});

const eventSchema = z.object({
  guestToken: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  props: z.record(z.any()).optional(),
});

export const startSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: topic, error: topicError } = await supabaseAdmin
      .from("topics")
      .select("id, slug, label")
      .eq("slug", data.topicSlug)
      .eq("active", true)
      .maybeSingle();
    if (topicError) throw topicError;
    if (!topic) throw new Error("Unknown topic");

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "irl_pair", status: "active", spice_max: data.spiceMax ?? 2 })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: session.id,
        guest_token: data.guestToken,
        display_name: data.displayName ?? "You",
      })
      .select("id")
      .single();
    if (participantError) throw participantError;

    const { data: questions, error: questionsError } = await supabaseAdmin
      .from("questions")
      .select("id, text, option_a, option_b, option_c, spice_level")
      .eq("topic_id", topic.id)
      .eq("active", true)
      .lte("spice_level", data.spiceMax ?? 2)
      .limit(12);
    if (questionsError) throw questionsError;

    const pool = [...(questions ?? [])].sort(() => Math.random() - 0.5).slice(0, 3);
    if (pool.length === 0) throw new Error("No questions available for this topic");

    const { data: sessionQuestions, error: sqError } = await supabaseAdmin
      .from("session_questions")
      .insert(
        pool.map((q, index) => ({
          session_id: session.id,
          question_id: q.id,
          order_index: index,
        })),
      )
      .select("id, question_id, order_index");
    if (sqError) throw sqError;

    await supabaseAdmin.from("events").insert([
      {
        guest_token: data.guestToken,
        session_id: session.id,
        name: "session_created",
        props: { kind: "irl_pair" },
      },
      {
        guest_token: data.guestToken,
        session_id: session.id,
        name: "participant_joined",
        props: { session_id: session.id, is_guest: true },
      },
      {
        guest_token: data.guestToken,
        session_id: session.id,
        name: "topics_selected",
        props: { count: 1, topic: topic.slug },
      },
    ]);

    const ordered = (sessionQuestions ?? []).sort((a, b) => a.order_index - b.order_index);

    return {
      sessionId: session.id,
      participantId: participant.id,
      topicLabel: topic.label,
      questions: ordered.map((sq) => {
        const q = pool.find((item) => item.id === sq.question_id)!;
        return {
          sessionQuestionId: sq.id,
          questionId: q.id,
          text: q.text,
          options: [
            { key: "a" as const, label: q.option_a },
            { key: "b" as const, label: q.option_b },
            ...(q.option_c ? [{ key: "c" as const, label: q.option_c }] : []),
          ],
        };
      }),
    };
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => answerSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq, error: sqError } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id, revealed_at")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (sqError) throw sqError;
    if (!sq) throw new Error("Unknown question");

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", sq.session_id)
      .eq("guest_token", data.guestToken)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) throw new Error("Not a participant in this session");

    // Answers are append-only: re-answering inserts a new row.
    const { error: insertError } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: participant.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      reason_text: data.reasonText ?? null,
      reason_chip_id: data.reasonChipId ?? null,
      visibility: "session",
    });
    if (insertError) throw insertError;

    const { count: participantCount } = await supabaseAdmin
      .from("session_participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sq.session_id);

    const { data: answered } = await supabaseAdmin
      .from("answers")
      .select("participant_id")
      .eq("session_question_id", sq.id);

    const distinct = new Set((answered ?? []).map((row) => row.participant_id)).size;
    let revealed = sq.revealed_at !== null;

    if (!revealed && participantCount !== null && distinct >= participantCount) {
      await supabaseAdmin
        .from("session_questions")
        .update({ revealed_at: new Date().toISOString() })
        .eq("id", sq.id);
      revealed = true;
    }

    const { data: tallyRows } = await supabaseAdmin.rpc("question_tally", {
      _question_id: sq.question_id,
    });

    await supabaseAdmin.from("events").insert([
      {
        guest_token: data.guestToken,
        session_id: sq.session_id,
        name: "answer_submitted",
        props: { question_id: sq.question_id, has_reason: Boolean(data.reasonText) },
      },
      ...(revealed
        ? [
            {
              guest_token: data.guestToken,
              session_id: sq.session_id,
              name: "question_revealed",
              props: { question_id: sq.question_id },
            },
          ]
        : []),
    ]);

    return {
      revealed,
      tally: (tallyRows ?? []).map((row) => ({
        optionKey: row.option_key as "a" | "b" | "c",
        votes: Number(row.votes),
      })),
    };
  });

export const logEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => eventSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId ?? null,
      name: data.name,
      props: data.props ?? {},
    });
    return { ok: true };
  });

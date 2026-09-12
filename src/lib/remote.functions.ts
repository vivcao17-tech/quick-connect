import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { pickImpressionQuestion } from "@/lib/irl-helpers";
import { resolveIsTest } from "@/lib/testing.server";
import { notifyThreadReply } from "@/lib/notify.server";
import { shortToken, snapshotOf, toPlay } from "@/lib/remote-shared";
import type { Chip, OptionKey, PlayQuestion, Snapshot } from "@/lib/remote-shared";

export type { Chip, OptionKey, PlayQuestion };

const guest = z.string().uuid();

export const listTopicQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ topicSlug: z.string().min(1), guestToken: guest.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { drawQuestions } = await import("@/lib/selection.server");
    const { data: topic } = await supabaseAdmin
      .from("topics")
      .select("id, slug, label")
      .eq("slug", data.topicSlug)
      .eq("active", true)
      .maybeSingle();
    if (!topic) throw new Error("Unknown topic");

    // Q1 wants spice 1, Q2 spice 2 — every session gets one genuinely dividing question.
    const questions = await drawQuestions(supabaseAdmin, {
      slots: [{ count: 1, spice: 1 }, { count: 1, spice: 2 }, { count: 3 }],
      guestTokens: data.guestToken ? [data.guestToken] : [],
      modes: ["pair", "both"],
      spiceMax: 2,
      topicIds: [topic.id],
    });

    return {
      topic: { slug: topic.slug, label: topic.label },
      questions: questions.map((q) => ({
        id: q.id,
        ...snapshotOf({ ...q, chips: q.reason_chips ?? [] }),
      })),
    };
  });


export const createRemoteSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        displayName: z.string().min(1).max(40),
        topicSlug: z.string().min(1),
        questionIds: z.array(z.string().uuid()).min(3).max(5),
        /** Asking more people the same wall question overrides the impression slot. */
        impressionQuestionId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The third question is always an impression question.
    const questionIds = [...data.questionIds];
    if (data.impressionQuestionId) {
      const { data: chosen } = await supabaseAdmin
        .from("questions")
        .select("id, question_type")
        .eq("id", data.impressionQuestionId)
        .eq("question_type", "impression")
        .maybeSingle();
      if (chosen) questionIds[2] = chosen.id;
    }
    if (questionIds[2] !== data.impressionQuestionId) {
      // Scoped to this sender so they aren't handed the same read twice.
      const impression = await pickImpressionQuestion(supabaseAdmin, questionIds, {
        guestTokens: [data.guestToken],
      });
      if (impression) questionIds[2] = impression.id;
    }

    const { data: questions, error: qError } = await supabaseAdmin
      .from("questions")
      .select("id, text, option_a, option_b, option_c, question_type, stem_other, stem_self, follow_up, reason_chips(id, option_key, text)")
      .in("id", questionIds);
    if (qError) throw qError;
    if (!questions || questions.length !== questionIds.length) {
      throw new Error("Some questions are unavailable");
    }

    const { data: session, error: sError } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "remote", status: "active", is_test: await resolveIsTest(supabaseAdmin, { guestToken: data.guestToken }) })
      .select("id")
      .single();
    if (sError) throw sError;

    const { data: participant, error: pError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: session.id,
        guest_token: data.guestToken,
        display_name: data.displayName,
        role: "sender",
      })
      .select("id")
      .single();
    if (pError) throw pError;

    const { data: sqs, error: sqError } = await supabaseAdmin
      .from("session_questions")
      .insert(
        questionIds.map((id, index) => {
          const q = questions.find((row) => row.id === id)!;
          return {
            session_id: session.id,
            question_id: id,
            order_index: index,
            snapshot: snapshotOf({ ...q, chips: q.reason_chips ?? [] }) as never,
          };
        }),
      )
      .select("id, question_id, order_index, snapshot");
    if (sqError) throw sqError;

    // Asking more people the same wall question: they already answered it about
    // themselves, so carry that answer over instead of asking again.
    const prefilled: string[] = [];
    if (data.impressionQuestionId && questionIds[2] === data.impressionQuestionId) {
      const { myParticipants } = await import("@/lib/identity.server");
      const mine = await myParticipants(supabaseAdmin, {
        guestToken: data.guestToken,
        ...(data.profileId ? { profileId: data.profileId } : {}),
      });
      const ids = mine.map((row) => row.id);
      const target = (sqs ?? []).find((sq) => sq.question_id === data.impressionQuestionId);
      if (ids.length > 0 && target) {
        const { data: prior } = await supabaseAdmin
          .from("answers")
          .select("option_key")
          .eq("question_id", data.impressionQuestionId)
          .neq("answer_role", "about_other")
          .in("participant_id", ids)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prior) {
          await supabaseAdmin.from("answers").insert({
            session_question_id: target.id,
            participant_id: participant.id,
            question_id: data.impressionQuestionId,
            option_key: prior.option_key,
            visibility: "session",
          });
          prefilled.push(target.id);
        }
      }
    }

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "session_created",
      props: { kind: "remote", question_count: questionIds.length },
    });

    return {
      sessionId: session.id,
      participantId: participant.id,
      prefilled,
      questions: (sqs ?? []).sort((a, b) => a.order_index - b.order_index).map(toPlay),
    };
  });

export const answerAsSender = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
        reasonText: z.string().max(240).optional(),
        reasonChipId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const { data: participant } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", sq.session_id)
      .eq("guest_token", data.guestToken)
      .maybeSingle();
    if (!participant) throw new Error("Not your session");

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: participant.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      reason_text: data.reasonText ?? null,
      reason_chip_id: data.reasonChipId ?? null,
      visibility: "session",
    });
    if (error) throw error;

    const { data: tally } = await supabaseAdmin.rpc("question_tally", {
      _question_id: sq.question_id,
    });

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: "answer_submitted",
      props: { question_id: sq.question_id, has_reason: Boolean(data.reasonText) },
    });

    return {
      tally: (tally ?? []).map((row) => ({
        optionKey: row.option_key as OptionKey,
        votes: Number(row.votes),
      })),
    };
  });

export const createInvites = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        sessionId: z.string().uuid(),
        recipients: z
          .array(
            z.object({
              label: z.string().min(1).max(40),
              note: z.string().max(160).optional(),
              // The sender's read on this one person, from the impression question.
              impression: z.enum(["a", "b", "c"]).optional(),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipantIn } = await import("@/lib/identity.server");

    // Either key: a set answered as a guest must stay sendable after signing in.
    const participant = await myParticipantIn(supabaseAdmin as never, data.sessionId, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });
    if (!participant) throw new Error("Not your session");


    const { data: invites, error } = await supabaseAdmin
      .from("invites")
      .insert(
        data.recipients.map((r) => ({
          session_id: data.sessionId,
          inviter_participant_id: participant.id,
          token: shortToken(),
          recipient_label: r.label,
          personal_note: r.note?.trim() ? r.note.trim() : null,
          sender_read_option: r.impression ?? null,
        })),
      )
      .select("token, recipient_label, personal_note, sender_read_option");
    if (error) throw error;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "invite_created",
      props: {
        count: data.recipients.length,
        with_read: data.recipients.filter((r) => r.impression).length,
      },
    });

    return {
      senderName: participant.display_name ?? "A friend",
      invites: (invites ?? []).map((row) => ({
        token: row.token,
        label: row.recipient_label ?? "",
        note: row.personal_note ?? "",
        readOption: (row.sender_read_option ?? null) as OptionKey | null,
      })),
    };
  });

/**
 * The links already made for this set. The send screen loads these on mount so
 * a reload never loses a link that has already gone out.
 */
export const listSessionInvites = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        profileId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipantIn, linkProfileToGuestRows } = await import("@/lib/identity.server");

    const identity = { guestToken: data.guestToken, profileId: data.profileId };
    await linkProfileToGuestRows(supabaseAdmin as never, identity);
    const participant = await myParticipantIn(supabaseAdmin as never, data.sessionId, identity);
    if (!participant) throw new Error("Not your session");

    const { data: invites } = await supabaseAdmin
      .from("invites")
      .select(
        "token, recipient_label, personal_note, completed_at, opened_at, created_at, sender_read_option",
      )
      .eq("session_id", data.sessionId)
      .order("created_at");

    return {
      invites: (invites ?? []).map((row) => ({
        token: row.token,
        label: row.recipient_label ?? "",
        note: row.personal_note ?? "",
        answered: Boolean(row.completed_at),
        opened: Boolean(row.opened_at),
        sentAt: row.created_at,
        readOption: (row.sender_read_option ?? null) as OptionKey | null,
      })),
    };
  });


/**
 * Just the names, for the link preview card. Read-only on purpose: unlike
 * getInvite it must not mark the invite as opened when a chat app fetches it.
 */
export const getInviteMeta = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(4).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("recipient_label, inviter_participant_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return { senderName: "", recipientLabel: "" };
    const { data: inviter } = await supabaseAdmin
      .from("session_participants")
      .select("display_name")
      .eq("id", invite.inviter_participant_id ?? "")
      .maybeSingle();
    return {
      senderName: inviter?.display_name ?? "",
      recipientLabel: invite.recipient_label ?? "",
    };
  });

export const getInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(4).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("id, session_id, personal_note, recipient_label, completed_at, inviter_participant_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("This link doesn't exist");

    const { data: inviter } = await supabaseAdmin
      .from("session_participants")
      .select("display_name")
      .eq("id", invite.inviter_participant_id ?? "")
      .maybeSingle();

    const { data: sqs, count } = await supabaseAdmin
      .from("session_questions")
      .select("question_id", { count: "exact" })
      .eq("session_id", invite.session_id);

    // Topic labels give the recipient context without spoiling the questions.
    let topics: string[] = [];
    const questionIds = (sqs ?? []).map((row) => row.question_id);
    if (questionIds.length > 0) {
      const { data: questions } = await supabaseAdmin
        .from("questions")
        .select("topic_id")
        .in("id", questionIds);
      const topicIds = [...new Set((questions ?? []).map((q) => q.topic_id).filter(Boolean))];
      if (topicIds.length > 0) {
        const { data: topicRows } = await supabaseAdmin
          .from("topics")
          .select("label")
          .in("id", topicIds as string[]);
        topics = [...new Set((topicRows ?? []).map((t) => t.label))];
      }
    }

    if (!invite.completed_at) {
      await supabaseAdmin
        .from("invites")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", invite.id)
        .is("opened_at", null);
    }

    return {
      senderName: inviter?.display_name ?? "A friend",
      note: invite.personal_note ?? "",
      recipientLabel: invite.recipient_label ?? "",
      questionCount: count ?? 0,
      topics,
      completed: Boolean(invite.completed_at),
    };
  });

/** Optional: the recipient can leave an email to hear about replies. Skippable. */
export const saveRecipientEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ token: z.string().min(4).max(40), email: z.string().email().max(160) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: invite } = await supabaseAdmin
      .from("invites")
      .update({ recipient_email: email })
      .eq("token", data.token)
      .select("session_id, child_session_id, recipient_participant_id")
      .maybeSingle();
    // Kept off session_participants on purpose: that table is readable by the
    // other people in the session, this address is not.
    if (!invite?.recipient_participant_id) return { saved: true, sent: false };

    await supabaseAdmin
      .from("participant_emails")
      .upsert(
        { participant_id: invite.recipient_participant_id, email },
        { onConflict: "participant_id" },
      );

    // Always re-send: the point of this email is handing them the link back.
    const sessionId = invite.child_session_id ?? invite.session_id;
    const { ensureSessionLink, describeSessionForParticipant } = await import(
      "@/lib/session-link.server"
    );
    const [linkToken, target] = await Promise.all([
      ensureSessionLink(supabaseAdmin, {
        sessionId,
        participantId: invite.recipient_participant_id,
      }),
      describeSessionForParticipant(supabaseAdmin, {
        sessionId,
        participantId: invite.recipient_participant_id,
      }),
    ]);

    const { sendSessionSavedEmail } = await import("@/lib/email.server");
    const result = await sendSessionSavedEmail(supabaseAdmin, {
      to: email,
      withName: target.withName,
      isGroup: target.isGroup,
      questionCount: target.questionCount,
      path: `/s/${linkToken}`,
    });
    if (!result.sent) console.error(`[email] recipient save not sent: ${result.reason}`);

    await supabaseAdmin.from("events").insert({
      session_id: sessionId,
      name: "session_save_email",
      props: { sent: result.sent, reason: result.reason ?? null, source: "remote" },
    });

    return { saved: true, sent: result.sent };
  });



export const startInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(4).max(40),
        guestToken: guest,
        displayName: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select(
        "id, session_id, child_session_id, inviter_participant_id, recipient_label, sender_read_option",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("This link doesn't exist");

    const { data: inviter } = await supabaseAdmin
      .from("session_participants")
      .select("display_name, guest_token")
      .eq("id", invite.inviter_participant_id ?? "")
      .maybeSingle();

    // Resume an existing run for this recipient.
    if (invite.child_session_id) {
      const { data: sqs } = await supabaseAdmin
        .from("session_questions")
        .select("id, question_id, order_index, snapshot")
        .eq("session_id", invite.child_session_id)
        .order("order_index");
      const { data: me } = await supabaseAdmin
        .from("session_participants")
        .select("id")
        .eq("session_id", invite.child_session_id)
        .eq("role", "recipient")
        .maybeSingle();
      return {
        senderName: inviter?.display_name ?? "A friend",
        childSessionId: invite.child_session_id,
        participantId: me?.id ?? "",
        questions: (sqs ?? []).map(toPlay),
      };
    }

    const { data: parentQs } = await supabaseAdmin
      .from("session_questions")
      .select("id, question_id, order_index, snapshot")
      .eq("session_id", invite.session_id)
      .order("order_index");
    if (!parentQs || parentQs.length === 0) throw new Error("Nothing to answer here");

    // The sender answered these before any link existed — the recipient answers the same three.
    const { data: senderAnswers } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, question_id, option_key, reason_text, reason_chip_id, created_at")
      .eq("participant_id", invite.inviter_participant_id ?? "")
      .order("created_at");

    // A run started from a test room stays a test room, and so does an
    // automated or owner-driven one.
    const { data: parentSession } = await supabaseAdmin
      .from("sessions")
      .select("is_test")
      .eq("id", invite.session_id)
      .maybeSingle();
    const parentIsTest =
      Boolean(parentSession?.is_test) ||
      (await resolveIsTest(supabaseAdmin, { guestToken: data.guestToken }));

    const { data: child, error: cError } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "remote", status: "active", is_test: parentIsTest })
      .select("id")
      .single();
    if (cError) throw cError;

    const { data: senderParticipant, error: spError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: child.id,
        display_name: inviter?.display_name ?? "A friend",
        role: "sender",
        guest_token: inviter?.guest_token ?? null,
      })
      .select("id")
      .single();
    if (spError) throw spError;

    const { data: me, error: meError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: child.id,
        guest_token: data.guestToken,
        display_name: data.displayName?.trim() || invite.recipient_label || "You",
        role: "recipient",
      })
      .select("id")
      .single();
    if (meError) throw meError;

    const { data: childQs, error: cqError } = await supabaseAdmin
      .from("session_questions")
      .insert(
        parentQs.map((q, index) => ({
          session_id: child.id,
          question_id: q.question_id,
          order_index: index,
          snapshot: q.snapshot as never,
        })),
      )
      .select("id, question_id, order_index, snapshot");
    if (cqError) throw cqError;

    const ordered = (childQs ?? []).sort((a, b) => a.order_index - b.order_index);

    // Carry the sender's answers into this pair so the reveal can happen the moment the
    // recipient answers — the sender is never asked to answer again.
    const carried = ordered
      .map((cq, index) => {
        const parent = parentQs[index]!;
        const answer = [...(senderAnswers ?? [])]
          .reverse()
          .find((a) => a.session_question_id === parent.id);
        if (!answer) return null;
        return {
          session_question_id: cq.id,
          participant_id: senderParticipant.id,
          question_id: cq.question_id,
          option_key: answer.option_key,
          reason_text: answer.reason_text,
          reason_chip_id: answer.reason_chip_id,
          visibility: "session",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    if (carried.length > 0) {
      const { error: caError } = await supabaseAdmin.from("answers").insert(carried);
      if (caError) throw caError;
    }

    // The sender read this specific person before the link existed. Now that the
    // person has a row of their own, the read becomes a real answer about them.
    const childImpression = ordered.find(
      (cq) => (cq.snapshot as Snapshot | null)?.kind === "impression",
    );
    if (invite.sender_read_option && childImpression) {
      await supabaseAdmin.from("answers").insert({
        session_question_id: childImpression.id,
        participant_id: senderParticipant.id,
        question_id: childImpression.question_id,
        option_key: invite.sender_read_option,
        visibility: "session",
        answer_role: "about_other",
        about_participant_id: me.id,
      });
    }

    await supabaseAdmin
      .from("invites")
      .update({ child_session_id: child.id, recipient_participant_id: me.id })
      .eq("id", invite.id);

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: child.id,
      name: "invite_opened",
      props: { token: data.token },
    });

    return {
      senderName: inviter?.display_name ?? "A friend",
      childSessionId: child.id,
      participantId: me.id,
      questions: ordered.map(toPlay),
    };
  });


export const answerAsRecipient = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(4).max(40),
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
        reasonText: z.string().max(240).optional(),
        reasonChipId: z.string().uuid().optional(),
        answerRole: z.enum(["about_self", "about_other"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id, revealed_at, snapshot")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id, role, display_name, guest_token")
      .eq("session_id", sq.session_id);

    const me = (participants ?? []).find(
      (p) => p.role === "recipient" && p.guest_token === data.guestToken,
    );
    const sender = (participants ?? []).find((p) => p.role === "sender");
    if (!me) throw new Error("Not your link");

    const isImpression = (sq.snapshot as Snapshot | null)?.kind === "impression";
    const role = data.answerRole ?? "about_self";

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      reason_text: data.reasonText ?? null,
      reason_chip_id: data.reasonChipId ?? null,
      visibility: "session",
      answer_role: role,
      about_participant_id: role === "about_other" ? (sender?.id ?? null) : null,
    });
    if (error) throw error;

    const { data: rows } = await supabaseAdmin
      .from("answers")
      .select("participant_id, option_key, reason_text, answer_role, created_at")
      .eq("session_question_id", sq.id)
      .order("created_at", { ascending: true });

    const myRoles = new Set(
      (rows ?? []).filter((r) => r.participant_id === me.id).map((r) => r.answer_role),
    );
    const answeredBy = new Set((rows ?? []).map((r) => r.participant_id));
    // An impression question only counts once the recipient has answered both halves.
    const bothHalves = !isImpression || (myRoles.has("about_self") && myRoles.has("about_other"));
    let revealed = sq.revealed_at !== null;
    if (!revealed && bothHalves && answeredBy.size >= (participants ?? []).length) {
      await supabaseAdmin
        .from("session_questions")
        .update({ revealed_at: new Date().toISOString() })
        .eq("id", sq.id);
      revealed = true;
    }

    const latest = (participantId: string | undefined, answerRole = "about_self") =>
      participantId
        ? [...(rows ?? [])]
            .reverse()
            .find((r) => r.participant_id === participantId && r.answer_role === answerRole)
        : undefined;

    const senderAnswer = latest(sender?.id);
    const mine = latest(me.id);
    const myReadOfThem = latest(me.id, "about_other");
    /** The read the sender left on this person specifically, before sending the link. */
    const theirReadOfMe = latest(sender?.id, "about_other");

    // Mark the invite complete once every question in this run has been answered.
    const { data: allQs } = await supabaseAdmin
      .from("session_questions")
      .select("id")
      .eq("session_id", sq.session_id);
    const { data: myAnswers } = await supabaseAdmin
      .from("answers")
      .select("session_question_id")
      .eq("participant_id", me.id);
    const done =
      bothHalves &&
      new Set((myAnswers ?? []).map((a) => a.session_question_id)).size >= (allQs ?? []).length;
    if (done) {
      await supabaseAdmin
        .from("invites")
        .update({ completed_at: new Date().toISOString() })
        .eq("token", data.token)
        .is("completed_at", null);
    }

    // Global distribution for this question across everyone who has ever answered it.
    const { data: tally } = await supabaseAdmin.rpc("question_tally", {
      _question_id: sq.question_id,
    });

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: revealed ? "question_revealed" : "answer_submitted",
      props: { question_id: sq.question_id },
    });

    return {
      revealed,
      kind: isImpression ? ("impression" as const) : ("standard" as const),
      needsSecondHalf: isImpression && !bothHalves,
      // Impression pairing, both directions: how each read the other against
      // what that person said about themselves.
      impression:
        isImpression && revealed && senderAnswer && myReadOfThem
          ? {
              theirSelf: senderAnswer.option_key as OptionKey,
              myReadOfThem: myReadOfThem.option_key as OptionKey,
              match: senderAnswer.option_key === myReadOfThem.option_key,
              mySelf: (mine?.option_key ?? null) as OptionKey | null,
              theirReadOfMe: (theirReadOfMe?.option_key ?? null) as OptionKey | null,
              readMatch:
                mine?.option_key && theirReadOfMe?.option_key
                  ? mine.option_key === theirReadOfMe.option_key
                  : null,
            }
          : null,
      senderName: sender?.display_name ?? "They",
      // Only ever sent once the question is revealed — otherwise it leaks their answer.
      sender:
        revealed && senderAnswer
          ? {
              optionKey: senderAnswer.option_key as OptionKey,
              reason: senderAnswer.reason_text ?? "",
            }
          : null,
      mine: mine
        ? { optionKey: mine.option_key as OptionKey, reason: mine.reason_text ?? "" }
        : null,
      tally: (tally ?? []).map((row) => ({
        optionKey: row.option_key as OptionKey,
        votes: Number(row.votes),
      })),
      finished: done,
    };
  });

/* The sender answers before any link exists, so nobody answers inside a pair session
   except the recipient — answerInPair was removed on purpose. */

/** Every question in a pair session with both sides' answers and thread counts. */
export const getPairSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id, role, display_name, guest_token")
      .eq("session_id", data.sessionId);
    const me = (participants ?? []).find((p) => p.guest_token === data.guestToken);
    if (!me) throw new Error("Not your conversation");
    const other = (participants ?? []).find((p) => p.id !== me.id);

    const { data: sqs } = await supabaseAdmin
      .from("session_questions")
      .select("id, order_index, revealed_at, snapshot")
      .eq("session_id", data.sessionId)
      .order("order_index");

    const ids = (sqs ?? []).map((q) => q.id);
    const { data: rows } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, participant_id, option_key, reason_text, created_at")
      .in("session_question_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at");
    const { data: messages } = await supabaseAdmin
      .from("thread_messages")
      .select("session_question_id")
      .in("session_question_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const label = (snap: Snapshot, key: string | undefined) =>
      snap.options.find((o) => o.key === key)?.label ?? "";

    return {
      otherName: other?.display_name ?? "them",
      questions: (sqs ?? []).map((q) => {
        const snap = q.snapshot as Snapshot;
        const pick = (participantId: string | undefined) =>
          participantId
            ? [...(rows ?? [])]
                .reverse()
                .find((r) => r.session_question_id === q.id && r.participant_id === participantId)
            : undefined;
        const mine = pick(me.id);
        const theirs = q.revealed_at ? pick(other?.id) : undefined;
        return {
          sessionQuestionId: q.id,
          index: q.order_index,
          text: snap.text,
          revealed: Boolean(q.revealed_at),
          myLabel: label(snap, mine?.option_key),
          myReason: mine?.reason_text ?? "",
          theirLabel: label(snap, theirs?.option_key),
          theirReason: theirs?.reason_text ?? "",
          differs: Boolean(
            mine?.option_key && theirs?.option_key && mine.option_key !== theirs.option_key,
          ),
          threadCount: (messages ?? []).filter((m) => m.session_question_id === q.id).length,
        };
      }),
    };
  });

export const postThreadMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        kind: z.enum(["reaction", "text", "quick_ask", "starter"]),
        body: z.string().min(1).max(240),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, snapshot")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const { data: mine } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name")
      .eq("session_id", sq.session_id)
      .eq("guest_token", data.guestToken)
      .limit(1);
    const me = mine?.[0];
    if (!me) throw new Error("Not your conversation");

    const { error } = await supabaseAdmin.from("thread_messages").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      kind: data.kind,
      body: data.body,
    });
    if (error) throw error;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: data.kind === "reaction" ? "reaction_added" : "thread_message_sent",
      props: { kind: data.kind },
    });

    await notifyThreadReply(supabaseAdmin, {
      sessionId: sq.session_id,
      sessionQuestionId: sq.id,
      actorParticipantId: me.id,
      actorName: me.display_name ?? "Someone",
      questionText: (sq.snapshot as Snapshot | null)?.text ?? "one of your questions",
    });

    return { ok: true };
  });

export const getThread = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionQuestionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, revealed_at")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq || !sq.revealed_at) return { messages: [] };

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name, guest_token, profile_id")
      .eq("session_id", sq.session_id);

    const me = (participants ?? []).find((p) => p.guest_token === data.guestToken);
    if (!me) return { messages: [] };

    const { data: rows } = await supabaseAdmin
      .from("thread_messages")
      .select("id, participant_id, kind, body, created_at")
      .eq("session_question_id", sq.id)
      .order("created_at");

    // Where the reader left off, read before we clear it, so the client can
    // scroll to the first unread line instead of the bottom.
    const { data: readRow } = await supabaseAdmin
      .from("thread_reads")
      .select("read_at")
      .eq("participant_id", me.id)
      .eq("session_question_id", sq.id)
      .maybeSingle();
    const readAt = readRow?.read_at ?? null;
    const firstUnread = (rows ?? []).find(
      (row) =>
        row.participant_id !== me.id &&
        (!readAt || new Date(row.created_at) > new Date(readAt)),
    );

    // Opening the thread clears its unread state and any pending notifications.
    await supabaseAdmin
      .from("thread_reads")
      .upsert(
        {
          participant_id: me.id,
          session_question_id: sq.id,
          read_at: new Date().toISOString(),
        },
        { onConflict: "participant_id,session_question_id" },
      );
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("participant_id", me.id)
      .eq("session_question_id", sq.id)
      .is("read_at", null);

    // Names the reader sees are their own aliases when they set one.
    const { loadNotes } = await import("@/lib/notes.server");
    const { personKeyOf } = await import("@/lib/conversations.server");
    const notes = await loadNotes(supabaseAdmin as never, { guestToken: data.guestToken });
    const nameOf = (participantId: string) => {
      const person = (participants ?? []).find((p) => p.id === participantId);
      if (!person) return "Someone";
      const key = personKeyOf({
        profile_id: (person as { profile_id?: string | null }).profile_id ?? null,
        guest_token: person.guest_token,
        id: person.id,
      });
      return notes.get(key)?.nickname || person.display_name || "Someone";
    };

    return {
      firstUnreadId: firstUnread?.id ?? "",
      messages: (rows ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        body: row.body ?? "",
        mine: row.participant_id === me.id,
        who: nameOf(row.participant_id),
      })),
    };
  });


export const getSenderResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        profileId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipantIn, linkProfileToGuestRows } = await import("@/lib/identity.server");

    const identity = { guestToken: data.guestToken, profileId: data.profileId };
    await linkProfileToGuestRows(supabaseAdmin as never, identity);
    const participant = await myParticipantIn(supabaseAdmin as never, data.sessionId, identity);
    if (!participant) throw new Error("Not your session");

    const { data: parentQs } = await supabaseAdmin
      .from("session_questions")
      .select("id, order_index, snapshot")
      .eq("session_id", data.sessionId)
      .order("order_index");

    const { data: myAnswers } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, option_key, reason_text, created_at")
      .eq("participant_id", participant.id)
      .order("created_at");

    const questions = (parentQs ?? []).map((q) => {
      const snap = q.snapshot as Snapshot;
      const mine = [...(myAnswers ?? [])]
        .reverse()
        .find((a) => a.session_question_id === q.id);
      return {
        index: q.order_index,
        text: snap.text,
        options: snap.options,
        myOption: (mine?.option_key ?? null) as OptionKey | null,
        myReason: mine?.reason_text ?? "",
      };
    });

    const { data: invites } = await supabaseAdmin
      .from("invites")
      .select("token, recipient_label, personal_note, child_session_id, opened_at, completed_at, created_at")
      .eq("session_id", data.sessionId)
      .order("created_at");

    type AnswerRow = {
      index: number;
      text: string;
      myLabel: string;
      myReason: string;
      theirOption: OptionKey | null;
      theirLabel: string;
      theirReason: string;
      differs: boolean;
      sessionQuestionId: string | null;
      threadCount: number;
    };

    const recipients = [] as {
      token: string;
      label: string;
      note: string;
      answered: boolean;
      stale: boolean;
      createdAt: string;
      answers: AnswerRow[];
      childSessionId: string | null;
      differences: number;
    }[];

    for (const invite of invites ?? []) {
      const row = {
        token: invite.token,
        label: invite.recipient_label ?? "They",
        note: invite.personal_note ?? "",
        answered: Boolean(invite.completed_at),
        stale:
          !invite.completed_at &&
          Date.now() - new Date(invite.created_at).getTime() > 7 * 24 * 60 * 60 * 1000,
        createdAt: invite.created_at,
        answers: [] as AnswerRow[],
        childSessionId: invite.child_session_id as string | null,
        differences: 0,
      };

      if (invite.child_session_id) {
        const { data: childQs } = await supabaseAdmin
          .from("session_questions")
          .select("id, question_id, order_index, revealed_at, snapshot")
          .eq("session_id", invite.child_session_id)
          .order("order_index");
        const { data: childParticipants } = await supabaseAdmin
          .from("session_participants")
          .select("id, role")
          .eq("session_id", invite.child_session_id);
        const recipientParticipant = (childParticipants ?? []).find((p) => p.role === "recipient");
        const senderParticipant = (childParticipants ?? []).find((p) => p.role === "sender");

        const childIds = (childQs ?? []).map((q) => q.id);
        const { data: childAnswers } = await supabaseAdmin
          .from("answers")
          .select("session_question_id, participant_id, option_key, reason_text, created_at")
          .in(
            "session_question_id",
            childIds.length ? childIds : ["00000000-0000-0000-0000-000000000000"],
          )
          .order("created_at");
        const { data: childMessages } = await supabaseAdmin
          .from("thread_messages")
          .select("session_question_id")
          .in(
            "session_question_id",
            childIds.length ? childIds : ["00000000-0000-0000-0000-000000000000"],
          );

        const pick = (sqId: string, participantId: string | undefined) =>
          participantId
            ? [...(childAnswers ?? [])]
                .reverse()
                .find((a) => a.session_question_id === sqId && a.participant_id === participantId)
            : undefined;

        row.answers = (childQs ?? []).map((cq) => {
          const snap = cq.snapshot as Snapshot;
          const theirs = pick(cq.id, recipientParticipant?.id);
          const mine = pick(cq.id, senderParticipant?.id);
          const theirOption = (theirs?.option_key ?? null) as OptionKey | null;
          const label = (key: string | undefined) =>
            snap.options.find((o) => o.key === key)?.label ?? "";
          return {
            index: cq.order_index,
            text: snap.text,
            myLabel: label(mine?.option_key),
            myReason: mine?.reason_text ?? "",
            theirOption: cq.revealed_at ? theirOption : null,
            theirLabel: cq.revealed_at ? label(theirs?.option_key) : "",
            theirReason: cq.revealed_at ? (theirs?.reason_text ?? "") : "",
            differs: Boolean(
              cq.revealed_at && theirOption && mine?.option_key && theirOption !== mine.option_key,
            ),
            sessionQuestionId: cq.revealed_at ? cq.id : null,
            threadCount: (childMessages ?? []).filter((m) => m.session_question_id === cq.id).length,
          };
        });
        row.differences = row.answers.filter((a) => a.differs).length;
        if ((childAnswers ?? []).some((a) => a.participant_id === recipientParticipant?.id)) {
          row.answered = true;
        }
      }

      recipients.push(row);
    }

    // Most surprising difference first — never sorted by similarity.
    recipients.sort((a, b) => b.differences - a.differences);

    const headlines: string[] = [];
    const byText = new Map<string, { label: string; option: OptionKey; optionLabel: string; mine: string }[]>();
    for (const recipient of recipients) {
      for (const answer of recipient.answers) {
        if (!answer.theirOption) continue;
        const list = byText.get(answer.text) ?? [];
        list.push({
          label: recipient.label,
          option: answer.theirOption,
          optionLabel: answer.theirLabel,
          mine: answer.myLabel,
        });
        byText.set(answer.text, list);
      }
    }
    for (const [text, entries] of byText) {
      const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
      const odd = entries.filter(
        (entry) => entries.filter((other) => other.option === entry.option).length === 1,
      );
      if (entries.length >= 3 && odd.length === 1) {
        headlines.push(
          `Only ${odd[0]!.label} out of ${entries.length} picked "${odd[0]!.optionLabel}" on "${short}"`,
        );
        continue;
      }
      const opposite = entries.filter((entry) => entry.mine && entry.optionLabel !== entry.mine);
      if (opposite.length > 0) {
        headlines.push(
          `${[...new Set(opposite.map((entry) => entry.label))].join(", ")} went the opposite way on "${short}"`,
        );
      }
    }

    return {
      senderName: participant.display_name ?? "You",
      questions,
      recipients,
      headlines,
    };
  });


/** Everything the sender has sent out: one row per recipient, with unread replies. */
export const getInbox = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, profileId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipants: findParticipants, linkProfileToGuestRows } = await import(
      "@/lib/identity.server"
    );

    const identity = { guestToken: data.guestToken, profileId: data.profileId };
    await linkProfileToGuestRows(supabaseAdmin as never, identity);
    const mine = await findParticipants(supabaseAdmin as never, identity);
    const senderRows = mine.filter((p) => p.role === "sender");
    if (senderRows.length === 0) return { sets: [] };

    const parentIds = senderRows.map((p) => p.session_id);
    const { data: invites } = await supabaseAdmin
      .from("invites")
      .select("token, recipient_label, session_id, child_session_id, completed_at, created_at")
      .in("session_id", parentIds)
      .order("created_at", { ascending: false });

    const childIds = (invites ?? [])
      .map((i) => i.child_session_id)
      .filter((id): id is string => Boolean(id));

    const myChildParticipants = new Map<string, string>();
    for (const p of mine) {
      if (childIds.includes(p.session_id)) myChildParticipants.set(p.session_id, p.id);
    }

    const { data: childQs } = childIds.length
      ? await supabaseAdmin
          .from("session_questions")
          .select("id, session_id, revealed_at")
          .in("session_id", childIds)
      : { data: [] as { id: string; session_id: string; revealed_at: string | null }[] };

    const sqIds = (childQs ?? []).map((q) => q.id);
    const { data: answers } = sqIds.length
      ? await supabaseAdmin
          .from("answers")
          .select("session_question_id, participant_id, option_key, answer_role, created_at")
          .in("session_question_id", sqIds)
          .order("created_at")
      : { data: [] as { session_question_id: string; participant_id: string; option_key: string; answer_role: string; created_at: string }[] };

    const { data: messages } = sqIds.length
      ? await supabaseAdmin
          .from("thread_messages")
          .select("session_question_id, participant_id, created_at")
          .in("session_question_id", sqIds)
      : { data: [] as { session_question_id: string; participant_id: string; created_at: string }[] };

    const { data: reads } = sqIds.length
      ? await supabaseAdmin
          .from("thread_reads")
          .select("session_question_id, participant_id, read_at")
          .in("session_question_id", sqIds)
      : { data: [] as { session_question_id: string; participant_id: string; read_at: string }[] };

    const recipientsFor = (parentId: string) =>
      (invites ?? [])
        .filter((invite) => invite.session_id === parentId)
        .map((invite) => {
          const childId = invite.child_session_id;
          const mineId = childId ? myChildParticipants.get(childId) : undefined;
          const questions = (childQs ?? []).filter((q) => q.session_id === childId);

          let differed = 0;
          let unread = 0;
          for (const q of questions) {
            const rows = (answers ?? []).filter(
              (a) => a.session_question_id === q.id && a.answer_role === "about_self",
            );
            const my = [...rows].reverse().find((a) => a.participant_id === mineId);
            const theirs = [...rows].reverse().find((a) => a.participant_id !== mineId);
            if (q.revealed_at && my && theirs && my.option_key !== theirs.option_key) differed += 1;

            const readAt = (reads ?? []).find(
              (r) => r.session_question_id === q.id && r.participant_id === mineId,
            )?.read_at;
            unread += (messages ?? []).filter(
              (m) =>
                m.session_question_id === q.id &&
                m.participant_id !== mineId &&
                (!readAt || new Date(m.created_at) > new Date(readAt)),
            ).length;
          }

          return {
            token: invite.token,
            label: invite.recipient_label ?? "Someone",
            answered: Boolean(invite.completed_at),
            childSessionId: childId ?? "",
            differed,
            unread,
            questionIds: questions.map((q) => q.id),
          };
        });

    return {
      sets: senderRows.map((row) => ({
        sessionId: row.session_id,
        recipients: recipientsFor(row.session_id),
      })),
    };
  });

/**
 * Every answer set this person has already answered and can send again.
 *
 * Reusing a set is the normal case, not the exception: you meet someone new and
 * want them to answer what you already answered. Nothing here surfaces how old
 * a set is beyond its topic — the send screens deliberately don't age them.
 */
export const listMyAnswerSets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ guestToken: guest, profileId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipants, linkProfileToGuestRows } = await import("@/lib/identity.server");

    const identity = { guestToken: data.guestToken, profileId: data.profileId };
    await linkProfileToGuestRows(supabaseAdmin as never, identity);
    const mine = (await myParticipants(supabaseAdmin as never, identity)).filter(
      (row) => row.role === "sender",
    );
    if (mine.length === 0) return { sets: [] };

    const { data: sessions } = await supabaseAdmin
      .from("sessions")
      .select("id, created_at")
      .in("id", [...new Set(mine.map((row) => row.session_id))])
      .eq("kind", "remote");
    const sessionIds = (sessions ?? []).map((row) => row.id);
    if (sessionIds.length === 0) return { sets: [] };

    // Every sent invite spawns a per-recipient child session holding a copy of
    // the sender's answers (invites.child_session_id). Those are not new sets —
    // exclude them so each answer set appears exactly once.
    const { data: childLinks } = await supabaseAdmin
      .from("invites")
      .select("child_session_id")
      .in("child_session_id", sessionIds);
    const childIds = new Set(
      (childLinks ?? []).map((row) => row.child_session_id).filter(Boolean),
    );
    const ownSessions = (sessions ?? []).filter((row) => !childIds.has(row.id));
    const ownIds = ownSessions.map((row) => row.id);
    if (ownIds.length === 0) return { sets: [] };

    const { data: sqs } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id, order_index, snapshot")
      .in("session_id", ownIds)
      .order("order_index");

    const questionIds = [...new Set((sqs ?? []).map((row) => row.question_id))];
    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, topic_id")
      .in("id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);
    const topicIds = [...new Set((questions ?? []).map((q) => q.topic_id).filter(Boolean))];
    const { data: topicRows } = await supabaseAdmin
      .from("topics")
      .select("id, label")
      .in("id", topicIds.length ? (topicIds as string[]) : ["00000000-0000-0000-0000-000000000000"]);
    const topicOf = new Map((topicRows ?? []).map((t) => [t.id, t.label]));
    const questionTopic = new Map(
      (questions ?? []).map((q) => [q.id, q.topic_id ? (topicOf.get(q.topic_id) ?? "") : ""]),
    );

    const myIds = mine.map((row) => row.id);
    const { data: myAnswers } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, participant_id")
      .in("participant_id", myIds);
    const answeredSqIds = new Set((myAnswers ?? []).map((row) => row.session_question_id));

    const { data: invites } = await supabaseAdmin
      .from("invites")
      .select("session_id, completed_at")
      .in("session_id", ownIds);

    const sets = ownSessions
      .map((session) => {
        const rows = (sqs ?? []).filter((row) => row.session_id === session.id);
        const answered = rows.filter((row) => answeredSqIds.has(row.id)).length;
        const sessionInvites = (invites ?? []).filter((row) => row.session_id === session.id);
        const topics = [
          ...new Set(rows.map((row) => questionTopic.get(row.question_id) ?? "").filter(Boolean)),
        ];
        return {
          sessionId: session.id,
          createdAt: session.created_at,
          topic: topics.slice(0, 2).join(" · "),
          firstQuestion: (rows[0]?.snapshot as Snapshot | null)?.text ?? "",
          questionCount: rows.length,
          sentCount: sessionInvites.length,
          answeredCount: sessionInvites.filter((row) => row.completed_at).length,
          ready: rows.length > 0 && answered === rows.length,
        };
      })
      .filter((set) => set.ready)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return { sets };
  });

/**
 * One answer set as its creator sees it on the send screen: the questions and
 * what they picked, so they can send it again without answering anything.
 */
export const getAnswerSet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        profileId: z.string().uuid().optional(),
        sessionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipantIn, linkProfileToGuestRows } = await import("@/lib/identity.server");

    const identity = { guestToken: data.guestToken, profileId: data.profileId };
    await linkProfileToGuestRows(supabaseAdmin as never, identity);
    const participant = await myParticipantIn(supabaseAdmin as never, data.sessionId, identity);
    if (!participant) throw new Error("Not your session");

    const { data: sqs } = await supabaseAdmin
      .from("session_questions")
      .select("id, order_index, snapshot")
      .eq("session_id", data.sessionId)
      .order("order_index");

    const { data: answers } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, option_key, reason_text, created_at")
      .eq("participant_id", participant.id)
      .order("created_at");

    // The impression question in this set: the send screen asks for one read per
    // person against it, so it needs the stem template and both option labels.
    const impressionRow = (sqs ?? []).find(
      (row) => (row.snapshot as Snapshot | null)?.kind === "impression",
    );
    const impressionSnap = impressionRow ? (impressionRow.snapshot as Snapshot) : null;

    return {
      senderName: participant.display_name ?? "A friend",
      questions: (sqs ?? []).map((row) => {
        const snap = row.snapshot as Snapshot;
        const mine = [...(answers ?? [])]
          .reverse()
          .find((a) => a.session_question_id === row.id);
        const key = (mine?.option_key ?? null) as OptionKey | null;
        return {
          sessionQuestionId: row.id,
          text: snap.text,
          myLabel: key ? (snap.options.find((o) => o.key === key)?.label ?? "") : "",
          myReason: mine?.reason_text ?? "",
        };
      }),
      impression:
        impressionRow && impressionSnap
          ? {
              sessionQuestionId: impressionRow.id,
              stemOther: impressionSnap.stemOther ?? impressionSnap.text,
              options: impressionSnap.options,
            }
          : null,
    };
  });

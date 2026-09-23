import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveIsTest } from "@/lib/testing.server";

import {
  ASYNC_GROUP_KIND,
  ASYNC_QUESTION_COUNT,
  AUTO_REVEAL_HOURS,
  asyncMember,
  asyncSnapshot,
  pickAsyncGroupQuestions,
  promptsFor,
  revealAsyncSession,
} from "@/lib/async-group.server";
import type { RevealBlock } from "@/lib/async-group.server";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

const guest = z.string().uuid();

export const createAsyncGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        displayName: z.string().min(1).max(40),
        topicSlug: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let topicId: string | null = null;
    if (data.topicSlug) {
      const { data: topic } = await supabaseAdmin
        .from("topics")
        .select("id")
        .eq("slug", data.topicSlug)
        .maybeSingle();
      topicId = topic?.id ?? null;
    }

    const { closingImpression } = await import("@/lib/impression.server");
    const questions = await pickAsyncGroupQuestions(
      supabaseAdmin,
      topicId,
      ASYNC_QUESTION_COUNT - 1,
      data.guestToken,
    );
    if (questions.length === 0) throw new Error("No questions available");

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        kind: ASYNC_GROUP_KIND,
        status: "answering",
        spice_max: 2,
        is_test: await resolveIsTest(supabaseAdmin, { guestToken: data.guestToken }),
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: pError } = await supabaseAdmin.from("session_participants").insert({
      session_id: session.id,
      guest_token: data.guestToken,
      display_name: data.displayName,
      role: "host",
    });
    if (pError) throw pError;

    // The last question is always an impression question.
    const impression = await closingImpression(supabaseAdmin, {
      excludeIds: questions.map((q) => q.id),
      sessionId: session.id,
      guestTokens: [data.guestToken],
    });
    if (impression) questions.push(impression);
    else {
      const extra = await pickAsyncGroupQuestions(
        supabaseAdmin,
        topicId,
        ASYNC_QUESTION_COUNT,
        data.guestToken,
      );
      const spare = extra.find((q) => !questions.some((row) => row.id === q.id));
      if (spare) questions.push(spare);
    }

    const { error: sqError } = await supabaseAdmin.from("session_questions").insert(
      questions.map((q, index) => ({
        session_id: session.id,
        question_id: q.id,
        order_index: index,
        snapshot: asyncSnapshot(q) as never,
      })),
    );
    if (sqError) throw sqError;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "session_created",
      props: { kind: ASYNC_GROUP_KIND, question_count: questions.length },
    });

    return { sessionId: session.id };
  });

export const getAsyncGroupState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, status, created_at, kind")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.kind !== ASYNC_GROUP_KIND) throw new Error("Unknown room");

    const me = await asyncMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!me) return { member: false as const };

    const { data: peopleRows } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name, role, joined_at")
      .eq("session_id", data.sessionId)
      .order("joined_at");
    const people = (peopleRows ?? []).map((p) => ({
      id: p.id,
      name: p.display_name ?? "Someone",
      isCreator: p.role === "host",
    }));

    const { data: sqRows } = await supabaseAdmin
      .from("session_questions")
      .select("id, order_index, snapshot, revealed_at")
      .eq("session_id", data.sessionId)
      .order("order_index");
    const sqs = sqRows ?? [];

    const { data: answerRows } = await supabaseAdmin
      .from("answers")
      .select(
        "session_question_id, participant_id, option_key, created_at, answer_role, about_participant_id",
      )
      .in("session_question_id", sqs.length ? sqs.map((sq) => sq.id) : [""])
      .order("created_at");

    const picks = new Map<string, OptionKey>();
    /** `sq:guesser:target` — one row per person this guesser read. */
    const guesses = new Map<string, OptionKey>();
    for (const row of answerRows ?? []) {
      if ((row.answer_role ?? "about_self") === "about_other") {
        if (row.about_participant_id) {
          guesses.set(
            `${row.session_question_id}:${row.participant_id}:${row.about_participant_id}`,
            row.option_key as OptionKey,
          );
        }
        continue;
      }
      picks.set(`${row.session_question_id}:${row.participant_id}`, row.option_key as OptionKey);
    }

    /** An impression question needs a read on everyone else plus a self-answer. */
    const finishedBy = (sq: { id: string; snapshot: unknown }, personId: string) => {
      if (!picks.has(`${sq.id}:${personId}`)) return false;
      if ((sq.snapshot as Snapshot).kind !== "impression") return true;
      return people
        .filter((other) => other.id !== personId)
        .every((other) => guesses.has(`${sq.id}:${personId}:${other.id}`));
    };

    const doneCount = people.filter((p) => sqs.every((sq) => finishedBy(sq, p.id))).length;

    // Reveal is decided here, server-side, and only ever from these two facts.
    const ageHours = (Date.now() - new Date(session.created_at).getTime()) / 3_600_000;
    let revealed = session.status === "revealed";
    if (!revealed) {
      const everyoneIn = people.length >= 2 && doneCount === people.length;
      if (everyoneIn || ageHours >= AUTO_REVEAL_HOURS) {
        await revealAsyncSession(
          supabaseAdmin,
          data.sessionId,
          everyoneIn ? "everyone" : "timeout",
        );
        revealed = true;
      }
    }

    const { stemForTarget, selfStem } = await import("@/lib/impression.server");
    const questions = sqs.map((sq) => {
      const snap = sq.snapshot as Snapshot;
      const isImpression = snap.kind === "impression";
      const others = people.filter((p) => p.id !== me.id);
      return {
        sessionQuestionId: sq.id,
        index: sq.order_index,
        text: snap.text,
        options: snap.options,
        // Only complete once every part is in, so the flow doesn't skip ahead.
        myAnswer: finishedBy(sq, me.id) ? (picks.get(`${sq.id}:${me.id}`) ?? null) : null,
        impression: isImpression
          ? {
              targets: others.map((p) => ({
                participantId: p.id,
                name: p.name,
                stem: stemForTarget(snap, p.name),
                guessed: guesses.get(`${sq.id}:${me.id}:${p.id}`) ?? null,
              })),
              selfStem: selfStem(snap),
              selfAnswer: picks.get(`${sq.id}:${me.id}`) ?? null,
              // Personal: only what other people said about me.
              aboutMe: revealed
                ? others
                    .map((p) => {
                      const key = guesses.get(`${sq.id}:${p.id}:${me.id}`);
                      if (!key) return null;
                      return {
                        name: p.name,
                        optionKey: key,
                        label: snap.options.find((o) => o.key === key)?.label ?? "",
                      };
                    })
                    .filter(
                      (row): row is { name: string; optionKey: OptionKey; label: string } =>
                        row !== null,
                    )
                : [],
            }
          : null,
      };
    });

    const blocks: RevealBlock[] = revealed
      ? sqs
          .filter((sq) => (sq.snapshot as Snapshot).kind !== "impression")
          .map((sq) => {
            const snap = sq.snapshot as Snapshot;
            const groups = snap.options.map((option) => ({
              optionKey: option.key,
              label: option.label,
              people: people
                .filter((p) => picks.get(`${sq.id}:${p.id}`) === option.key)
                .map((p) => ({ id: p.id, name: p.id === me.id ? "You" : p.name })),
            }));
            return {
              sessionQuestionId: sq.id,
              index: sq.order_index,
              text: snap.text,
              options: groups.map((g) => ({
                key: g.optionKey,
                label: g.label,
                names: g.people.map((p) => p.name),
                mine: g.people.some((p) => p.id === me.id),
              })),
              prompts: promptsFor(me.id, groups),
            };
          })
      : [];

    const { data: email } = await supabaseAdmin
      .from("participant_emails")
      .select("email")
      .eq("participant_id", me.id)
      .maybeSingle();

    return {
      member: true as const,
      sessionId: session.id,
      revealed,
      isCreator: me.role === "host",
      me: { participantId: me.id, name: me.display_name ?? "You" },
      totalPeople: people.length,
      answeredPeople: doneCount,
      hoursLeft: Math.max(0, Math.ceil(AUTO_REVEAL_HOURS - ageHours)),
      hasEmail: Boolean(email?.email),
      questions,
      blocks,
    };
  });

export const answerInAsyncGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
        /** Set when this is a guess about someone else in the room. */
        aboutParticipantId: z.string().uuid().optional(),
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

    const me = await asyncMember(supabaseAdmin, sq.session_id, data.guestToken);
    if (!me) throw new Error("Not in this room");

    const aboutOther = Boolean(data.aboutParticipantId);
    const role = aboutOther ? "about_other" : "about_self";

    const query = supabaseAdmin
      .from("answers")
      .select("id")
      .eq("session_question_id", sq.id)
      .eq("participant_id", me.id)
      .eq("answer_role", role);
    const { data: already } = await (
      aboutOther ? query.eq("about_participant_id", data.aboutParticipantId!) : query
    ).maybeSingle();
    if (already) return { ok: true };

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      visibility: "session",
      answer_role: role,
      about_participant_id: aboutOther ? data.aboutParticipantId! : me.id,
    });
    if (error) throw error;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: "answer_submitted",
      props: { question_id: sq.question_id, kind: ASYNC_GROUP_KIND, answer_role: role },
    });

    return { ok: true };
  });

/** Always available to the creator, whoever is still missing. */
export const revealAsyncGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await asyncMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!me || me.role !== "host") throw new Error("Only the person who started this can reveal");
    await revealAsyncSession(supabaseAdmin, data.sessionId, "creator");
    return { ok: true };
  });

export const saveAsyncGroupEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        email: z.string().email().max(160),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await asyncMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!me) throw new Error("Not in this room");

    await supabaseAdmin
      .from("participant_emails")
      .upsert(
        { participant_id: me.id, email: data.email.trim().toLowerCase() },
        { onConflict: "participant_id" },
      );

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "group_async_email_saved",
      props: {},
    });
    return { saved: true };
  });

/** The creator's own screen: who's in, who's answered, and the links to send. */
export const getAsyncGroupHub = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await asyncMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!me || me.role !== "host") throw new Error("Only the person who started this can see this");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("status, created_at")
      .eq("id", data.sessionId)
      .maybeSingle();

    const { data: sqs } = await supabaseAdmin
      .from("session_questions")
      .select("id")
      .eq("session_id", data.sessionId);
    const sqIds = (sqs ?? []).map((sq) => sq.id);

    const { data: people } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name, role")
      .eq("session_id", data.sessionId);

    const { data: answerRows } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, participant_id")
      .in("session_question_id", sqIds.length ? sqIds : [""]);

    const byPerson = new Map<string, Set<string>>();
    for (const row of answerRows ?? []) {
      const set = byPerson.get(row.participant_id) ?? new Set<string>();
      set.add(row.session_question_id);
      byPerson.set(row.participant_id, set);
    }
    const done = (id: string) => (byPerson.get(id)?.size ?? 0) >= sqIds.length && sqIds.length > 0;

    const { data: invites } = await supabaseAdmin
      .from("invites")
      .select("token, recipient_label, personal_note, recipient_participant_id, opened_at")
      .eq("session_id", data.sessionId)
      .order("created_at");

    return {
      status: session?.status ?? "answering",
      revealed: session?.status === "revealed",
      questionCount: sqIds.length,
      totalPeople: (people ?? []).length,
      answeredPeople: (people ?? []).filter((p) => done(p.id)).length,
      iAnswered: done(me.id),
      hoursLeft: Math.max(
        0,
        Math.ceil(
          AUTO_REVEAL_HOURS -
            (Date.now() - new Date(session?.created_at ?? Date.now()).getTime()) / 3_600_000,
        ),
      ),
      invites: (invites ?? []).map((invite) => ({
        token: invite.token,
        label: invite.recipient_label ?? "",
        note: invite.personal_note ?? "",
        opened: Boolean(invite.opened_at),
        answered: invite.recipient_participant_id ? done(invite.recipient_participant_id) : false,
      })),
    };
  });

/** Opening a recipient link: they join the same room, they can never invite anyone. */
export const joinAsyncGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(4).max(40),
        guestToken: guest,
        displayName: z.string().min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("id, session_id, recipient_participant_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("This link doesn't exist");

    const existing = await asyncMember(supabaseAdmin, invite.session_id, data.guestToken);
    if (existing) return { sessionId: invite.session_id };

    const { data: participant, error } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: invite.session_id,
        guest_token: data.guestToken,
        display_name: data.displayName.trim(),
        role: "member",
      })
      .select("id")
      .single();
    if (error) throw error;

    if (!invite.recipient_participant_id) {
      await supabaseAdmin
        .from("invites")
        .update({ recipient_participant_id: participant.id, opened_at: new Date().toISOString() })
        .eq("id", invite.id);
    }

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: invite.session_id,
      name: "invite_opened",
      props: { kind: ASYNC_GROUP_KIND },
    });

    return { sessionId: invite.session_id };
  });

/** The recipient's landing screen: who sent it, and the line they wrote you. */
export const getAsyncInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(4).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("session_id, recipient_label, personal_note, inviter_participant_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("This link doesn't exist");

    const { data: inviter } = invite.inviter_participant_id
      ? await supabaseAdmin
          .from("session_participants")
          .select("display_name")
          .eq("id", invite.inviter_participant_id)
          .maybeSingle()
      : { data: null };

    const { count } = await supabaseAdmin
      .from("session_questions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", invite.session_id);

    return {
      sessionId: invite.session_id,
      fromName: inviter?.display_name ?? "A friend",
      label: invite.recipient_label ?? "",
      note: invite.personal_note ?? "",
      questionCount: count ?? 0,
    };
  });

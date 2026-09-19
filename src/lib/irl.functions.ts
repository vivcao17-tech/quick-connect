import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveIsTest } from "@/lib/testing.server";

import {
  memberOf,
  roomCode,
  seedQuestions,
} from "@/lib/irl-helpers";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

const guest = z.string().uuid();

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, displayName: z.string().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let code = roomCode();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data: taken } = await supabaseAdmin
        .from("sessions")
        .select("id")
        .eq("room_code", code)
        .in("status", [
          "lobby",
          "pack_select",
          "topic_select",
          "question_select",
          "answering",
          "revealed",
        ])
        .maybeSingle();
      if (!taken) break;
      code = roomCode();
    }

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "irl_pair", status: "lobby", room_code: code, current_index: 0, is_test: await resolveIsTest(supabaseAdmin, { guestToken: data.guestToken }) })
      .select("id, room_code")
      .single();
    if (error) throw error;

    const { data: participant, error: pError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: session.id,
        guest_token: data.guestToken,
        display_name: data.displayName,
        role: "host",
      })
      .select("id")
      .single();
    if (pError) throw pError;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "session_created",
      props: { kind: "irl_pair" },
    });

    return { sessionId: session.id, participantId: participant.id, roomCode: session.room_code! };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        displayName: z.string().min(1).max(40),
        roomCode: z.string().min(4).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.roomCode.toUpperCase();

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, status, kind")
      .eq("room_code", code)
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session) throw new Error("No room with that code");

    const { data: existing } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", session.id)
      .eq("guest_token", data.guestToken)
      .maybeSingle();

    if (existing) return { sessionId: session.id, participantId: existing.id };

    const { data: participant, error } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: session.id,
        guest_token: data.guestToken,
        display_name: data.displayName,
        role: "member",
      })
      .select("id")
      .single();
    if (error) throw error;

    // Group rooms wait for the host to start; pair rooms jump straight to picking a pack.
    if (session.status === "lobby" && session.kind !== "group") {
      await supabaseAdmin
        .from("sessions")
        .update({ status: "pack_select" })
        .eq("id", session.id);
    }

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "participant_joined",
      props: { session_id: session.id, is_guest: true },
    });

    return { sessionId: session.id, participantId: participant.id, kind: session.kind };
  });

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Everything the screen needs in one database call, plus the room's pack.
    const [{ data: raw, error }, { data: packRow }] = await Promise.all([
      supabaseAdmin.rpc("room_state", {
        _session_id: data.sessionId,
        _guest_token: data.guestToken,
      }),
      supabaseAdmin.from("sessions").select("pack").eq("id", data.sessionId).maybeSingle(),
    ]);
    if (error) throw error;

    const state = (raw ?? {}) as {
      me: { id: string; display_name: string | null; role: string } | null;
      session: {
        id: string;
        room_code: string | null;
        status: string;
        current_index: number;
        spice_max: number;
      } | null;
      participants: { id: string; display_name: string | null; role: string }[];
      topics: { id: string; slug: string; label: string }[];
      topicPicks: { participant_id: string; topic_id: string }[];
      votes: { participant_id: string; question_id: string }[];
      questions: {
        id: string;
        question_id: string;
        order_index: number;
        revealed_at: string | null;
        snapshot: Snapshot;
        question_type: string;
      }[];
      answers: {
        session_question_id: string;
        participant_id: string;
        option_key: string;
        answer_role: string;
      }[];
    };

    const me = state.me;
    if (!me) throw new Error("Not in this room");
    const session = state.session;
    if (!session) throw new Error("Room is gone");

    const people = (state.participants ?? []).map((p) => ({
      participantId: p.id,
      name: p.display_name ?? "Someone",
      isMe: p.id === me.id,
    }));
    const others = people.filter((p) => !p.isMe);

    const topics = state.topics ?? [];
    const topicPicks = state.topicPicks ?? [];

    const topicCount = new Map<string, number>();
    for (const row of topicPicks) {
      topicCount.set(row.participant_id, (topicCount.get(row.participant_id) ?? 0) + 1);
    }
    const myTopicIds = topicPicks
      .filter((row) => row.participant_id === me.id)
      .map((row) => row.topic_id);

    const voteCount = new Map<string, number>();
    for (const row of state.votes ?? []) {
      voteCount.set(row.participant_id, (voteCount.get(row.participant_id) ?? 0) + 1);
    }

    const sqs = state.questions ?? [];
    const typeOf = new Map(sqs.map((sq) => [sq.question_id, sq.question_type ?? "standard"]));
    const answers = state.answers ?? [];

    const otherPerson = people.find((p) => !p.isMe);

    const questions = (sqs ?? []).map((sq) => {
      const snap = sq.snapshot as Snapshot;
      const revealed = sq.revealed_at !== null;
      const questionType = typeOf.get(sq.question_id) ?? "standard";
      const rows = (answers ?? []).filter((a) => a.session_question_id === sq.id);

      const latest = new Map<string, string>();
      const latestAboutOther = new Map<string, string>();
      for (const row of rows) {
        if ((row.answer_role ?? "about_self") === "about_other") {
          latestAboutOther.set(row.participant_id, row.option_key);
        } else {
          latest.set(row.participant_id, row.option_key);
        }
      }
      const mine = latest.get(me.id) ?? null;
      const myAboutOther = latestAboutOther.get(me.id) ?? null;

      const labelOf = (key: string | null | undefined) =>
        snap.options.find((o) => o.key === key)?.label ?? "—";

      // Impression reveal: plain sentences with real names, one per direction.
      let impression: {
        lines: { leadIn: string; answer: string; tail: string; tailAnswer: string; match: boolean }[];
        summary: string;
      } | null = null;

      if (questionType === "impression" && revealed && otherPerson) {
        const them = otherPerson.name;
        const mySelf = latest.get(me.id) ?? null;
        const theirSelf = latest.get(otherPerson.participantId) ?? null;
        const theirReadOfMe = latestAboutOther.get(otherPerson.participantId) ?? null;
        const myReadOfThem = myAboutOther;

        const theyGotMe = Boolean(mySelf && theirReadOfMe && mySelf === theirReadOfMe);
        const iGotThem = Boolean(theirSelf && myReadOfThem && theirSelf === myReadOfThem);

        const lines = [
          {
            leadIn: `${them} read you as`,
            answer: labelOf(theirReadOfMe),
            tail: "You said",
            tailAnswer: labelOf(mySelf),
            match: theyGotMe,
          },
          {
            leadIn: `You read ${them} as`,
            answer: labelOf(myReadOfThem),
            tail: `${them} said`,
            tailAnswer: labelOf(theirSelf),
            match: iGotThem,
          },
        ];

        const summary =
          theyGotMe && iGotThem
            ? "You both called it."
            : !theyGotMe && !iGotThem
              ? "Neither of you saw it coming."
              : theyGotMe
                ? `${them} had you figured out. You didn't.`
                : `You had ${them} figured out. ${them} didn't.`;

        impression = { lines, summary };
      }

      return {
        sessionQuestionId: sq.id,
        questionId: sq.question_id,
        questionType,
        text: snap.text,
        followUp: snap.followUp ?? null,
        stemOther: snap.stemOther ?? null,
        stemSelf: snap.stemSelf ?? null,
        options: snap.options,
        revealed,
        myAnswer: mine as OptionKey | null,
        myAnswerAboutOther: myAboutOther as OptionKey | null,
        // An impression question only counts as answered once both halves are in.
        mySubmitted:
          questionType === "impression" ? Boolean(mine && myAboutOther) : Boolean(mine),
        otherName: otherPerson?.name ?? "them",
        answeredCount: latest.size,
        impression,
        // Other people's picks are withheld until the row is revealed.
        picks: revealed
          ? people.map((p) => ({
              name: p.name,
              isMe: p.isMe,
              optionKey: (latest.get(p.participantId) ?? null) as OptionKey | null,
              label: labelOf(latest.get(p.participantId)),
            }))
          : [],
      };
    });

    const differing = questions.filter((q) => {
      if (!q.revealed) return false;
      const keys = q.picks.map((p) => p.optionKey).filter(Boolean);
      return new Set(keys).size > 1;
    }).length;


    return {
      sessionId: session.id,
      roomCode: session.room_code,
      status: session.status,
      currentIndex: session.current_index,
      spiceMax: session.spice_max,
      me: { participantId: me.id, name: me.display_name ?? "You" },
      others: others.map((o) => ({
        name: o.name,
        topicsDone: (topicCount.get(o.participantId) ?? 0) >= 2,
        questionsDone: (voteCount.get(o.participantId) ?? 0) >= 1,
      })),
      topics: topics ?? [],
      myTopicIds,
      myTopicsDone: myTopicIds.length >= 2,
      myVotesDone: (voteCount.get(me.id) ?? 0) >= 1,
      questions,
      differing,
    };
  });

export const pickTopics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        topicIds: z.array(z.string().uuid()).min(2).max(2),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await memberOf(supabaseAdmin, data.sessionId, data.guestToken);

    // Everything that doesn't depend on my picks lands in the same wave.
    const reads = Promise.all([
      supabaseAdmin.from("session_participants").select("id").eq("session_id", data.sessionId),
      supabaseAdmin
        .from("session_participant_topics")
        .select("participant_id")
        .eq("session_id", data.sessionId)
        .neq("participant_id", me.id),
      supabaseAdmin
        .from("sessions")
        .select("spice_max, status")
        .eq("id", data.sessionId)
        .maybeSingle(),
    ]);
    void supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "topics_selected",
      props: { count: data.topicIds.length },
    });

    await supabaseAdmin
      .from("session_participant_topics")
      .delete()
      .eq("participant_id", me.id);
    const { error } = await supabaseAdmin.from("session_participant_topics").insert(
      data.topicIds.map((topicId) => ({
        session_id: data.sessionId,
        participant_id: me.id,
        topic_id: topicId,
      })),
    );
    if (error) throw error;

    const [{ data: participants }, { data: picks }, { data: session }] = await reads;

    const done = new Map<string, number>([[me.id, data.topicIds.length]]);
    for (const row of picks ?? []) done.set(row.participant_id, (done.get(row.participant_id) ?? 0) + 1);
    const everyone =
      (participants ?? []).length >= 2 &&
      (participants ?? []).every((p) => (done.get(p.id) ?? 0) >= 2);

    if (everyone && session?.status === "topic_select") {
      // Only the first question blocks the tap — the rest are drawn behind it.
      await seedQuestions(supabaseAdmin, data.sessionId, session.spice_max, 1, 0);
      await supabaseAdmin
        .from("sessions")
        .update({ status: "answering", current_index: 0 })
        .eq("id", data.sessionId)
        .eq("status", "topic_select");
    }
    return { advanced: everyone };
  });


/** Tops the room up to its full set of questions; safe to call repeatedly. */
export const fillQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid(), want: z.number().min(1).max(8).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await memberOf(supabaseAdmin, data.sessionId, data.guestToken);

    const [{ count }, { data: session }] = await Promise.all([
      supabaseAdmin
        .from("session_questions")
        .select("id", { count: "exact", head: true })
        .eq("session_id", data.sessionId),
      supabaseAdmin
        .from("sessions")
        .select("spice_max, status")
        .eq("id", data.sessionId)
        .maybeSingle(),
    ]);
    const have = count ?? 0;
    const target = data.want ?? 3;
    if (!session || session.status === "ended" || have >= target) return { total: have };

    const added = await seedQuestions(supabaseAdmin, data.sessionId, session.spice_max, target - have);
    return { total: have + added };
  });

export const answerInRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
        answerRole: z.enum(["about_self", "about_other"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id, revealed_at")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const me = await memberOf(supabaseAdmin, sq.session_id, data.guestToken);
    const answerRole = data.answerRole ?? "about_self";

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", sq.session_id);
    const everyone = participants ?? [];
    const other = everyone.find((p) => p.id !== me.id);

    const { data: question } = await supabaseAdmin
      .from("questions")
      .select("question_type")
      .eq("id", sq.question_id)
      .maybeSingle();
    const questionType = question?.question_type ?? "standard";

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      answer_role: answerRole,
      about_participant_id: answerRole === "about_other" ? (other?.id ?? null) : me.id,
      visibility: "session",
    });
    if (error) throw error;

    const { data: answered } = await supabaseAdmin
      .from("answers")
      .select("participant_id, answer_role")
      .eq("session_question_id", sq.id);

    // Impression questions need both halves from everyone before they count as submitted.
    const complete = (participantId: string) => {
      const rows = (answered ?? []).filter((row) => row.participant_id === participantId);
      if (questionType !== "impression") return rows.length > 0;
      return (
        rows.some((row) => (row.answer_role ?? "about_self") === "about_self") &&
        rows.some((row) => row.answer_role === "about_other")
      );
    };
    const allIn = everyone.length > 0 && everyone.every((p) => complete(p.id));

    let revealed = sq.revealed_at !== null;
    if (!revealed && allIn) {
      await supabaseAdmin
        .from("session_questions")
        .update({ revealed_at: new Date().toISOString() })
        .eq("id", sq.id);
      await supabaseAdmin
        .from("sessions")
        .update({ status: "revealed" })
        .eq("id", sq.session_id);
      revealed = true;
    }


    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: "answer_submitted",
      props: { question_id: sq.question_id, has_reason: false },
    });

    return { revealed };
  });

export const advanceRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        action: z.enum(["next", "skip", "more", "end"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await memberOf(supabaseAdmin, data.sessionId, data.guestToken);

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("current_index, spice_max")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Room is gone");

    const { count } = await supabaseAdmin
      .from("session_questions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId);
    const total = count ?? 0;

    if (data.action === "end") {
      await supabaseAdmin.from("sessions").update({ status: "ended" }).eq("id", data.sessionId);
      return { status: "ended" as const };
    }

    if (data.action === "more") {
      // Adds one more question from the same topics and jumps straight to it.
      const added = await seedQuestions(supabaseAdmin, data.sessionId, session.spice_max, 1);
      if (added === 0) return { status: "answering" as const };
      await supabaseAdmin
        .from("sessions")
        .update({ status: "answering", current_index: total })
        .eq("id", data.sessionId);
      return { status: "answering" as const };
    }

    if (data.action === "skip") {
      await supabaseAdmin.from("events").insert({
        guest_token: data.guestToken,
        session_id: data.sessionId,
        name: "question_skipped",
        props: { index: session.current_index },
      });
    }

    const nextIndex = session.current_index + 1;
    // The background top-up may not have landed yet; don't end the room early.
    let available = total;
    if (nextIndex >= available && available < 3) {
      available += await seedQuestions(supabaseAdmin, data.sessionId, session.spice_max, 3 - available);
    }
    if (nextIndex >= available) {
      await supabaseAdmin
        .from("sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", data.sessionId);
      await supabaseAdmin.from("events").insert({
        guest_token: data.guestToken,
        session_id: data.sessionId,
        name: "session_ended",
        props: { question_count: total },
      });
      return { status: "ended" as const };
    }

    await supabaseAdmin
      .from("sessions")
      .update({ status: "answering", current_index: nextIndex })
      .eq("id", data.sessionId);
    return { status: "answering" as const };
  });

export const setSpice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        spiceMax: z.number().int().min(1).max(3),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await memberOf(supabaseAdmin, data.sessionId, data.guestToken);
    await supabaseAdmin
      .from("sessions")
      .update({ spice_max: data.spiceMax })
      .eq("id", data.sessionId);
    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "spice_changed",
      props: { spice_max: data.spiceMax },
    });
    return { ok: true };
  });

export const saveSessionEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ guestToken: guest, sessionId: z.string().uuid(), email: z.string().email() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await memberOf(supabaseAdmin, data.sessionId, data.guestToken);
    await supabaseAdmin
      .from("participant_emails")
      .upsert(
        { participant_id: me.id, email: data.email.trim().toLowerCase() },
        { onConflict: "participant_id" },
      );
    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "session_save_requested",
      props: { email: data.email },
    });

    const { ensureSessionLink, describeSessionForParticipant } = await import(
      "@/lib/session-link.server"
    );
    const [token, target] = await Promise.all([
      ensureSessionLink(supabaseAdmin, { sessionId: data.sessionId, participantId: me.id }),
      describeSessionForParticipant(supabaseAdmin, {
        sessionId: data.sessionId,
        participantId: me.id,
      }),
    ]);

    const { sendSessionSavedEmail } = await import("@/lib/email.server");
    const result = await sendSessionSavedEmail(supabaseAdmin, {
      to: data.email,
      withName: target.withName,
      isGroup: target.isGroup,
      questionCount: target.questionCount,
      path: `/s/${token}`,
    });
    if (!result.sent) console.error(`[email] session save not sent: ${result.reason}`);

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "session_save_email",
      props: { sent: result.sent, reason: result.reason ?? null, source: "room" },
    });

    return { ok: true, sent: result.sent };

  });

/** Opens a saved link: restores who this person was and where they left off. */
export const openSessionLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveSessionLink } = await import("@/lib/session-link.server");
    const resolved = await resolveSessionLink(supabaseAdmin, data.token);
    if (!resolved) return { ok: false as const };
    return { ok: true as const, guestToken: resolved.guestToken, path: resolved.path };
  });

export type RoomState = Awaited<ReturnType<typeof getRoomState>>;

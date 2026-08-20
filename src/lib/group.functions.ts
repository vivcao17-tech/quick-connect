import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  OBSERVER_ROLE,
  askLine,
  groupMember,
  isHostRole,
  minorityLine,
  pickGroupQuestions,
  questionSnapshot,
  settleHostRequest,
  transferHost,
} from "@/lib/group.server";
import { roomCode } from "@/lib/irl-helpers";
import { shortToken } from "@/lib/remote-shared";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

const guest = z.string().uuid();

export const createGroupRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        displayName: z.string().min(1).max(40),
        playing: z.boolean(),
        length: z.union([z.literal(5), z.literal(8)]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let code = roomCode();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data: taken } = await supabaseAdmin
        .from("sessions")
        .select("id")
        .eq("room_code", code)
        .neq("status", "ended")
        .maybeSingle();
      if (!taken) break;
      code = roomCode();
    }

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "group", status: "lobby", room_code: code, current_index: 0 })
      .select("id, room_code")
      .single();
    if (error) throw error;

    const { error: pError } = await supabaseAdmin.from("session_participants").insert({
      session_id: session.id,
      guest_token: data.guestToken,
      display_name: data.displayName,
      role: data.playing ? "host" : OBSERVER_ROLE,
    });
    if (pError) throw pError;

    const questions = await pickGroupQuestions(supabaseAdmin, data.length);
    if (questions.length === 0) throw new Error("No questions available");

    const { error: sqError } = await supabaseAdmin.from("session_questions").insert(
      questions.map((q, index) => ({
        session_id: session.id,
        question_id: q.id,
        order_index: index,
        snapshot: questionSnapshot(q) as never,
      })),
    );
    if (sqError) throw sqError;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "session_created",
      props: { kind: "group", question_count: questions.length, host_playing: data.playing },
    });

    return { sessionId: session.id, roomCode: session.room_code! };
  });

export const getGroupState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);

    const pendingRequest = await settleHostRequest(supabaseAdmin, data.sessionId);

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, room_code, status, current_index")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Room is gone");

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name, role, joined_at")
      .eq("session_id", data.sessionId)
      .order("joined_at");

    const everyone = (participants ?? []).map((p) => ({
      participantId: p.id,
      name: p.display_name ?? "Someone",
      role: p.role,
      isMe: p.id === me.id,
      isHost: isHostRole(p.role),
    }));
    const players = everyone.filter((p) => p.role !== OBSERVER_ROLE);

    const { data: sqRows } = await supabaseAdmin
      .from("session_questions")
      .select("id, question_id, order_index, snapshot, revealed_at")
      .eq("session_id", data.sessionId)
      .order("order_index");
    const sqs = sqRows ?? [];

    const { data: answerRows } = await supabaseAdmin
      .from("answers")
      .select("session_question_id, participant_id, option_key, created_at")
      .in("session_question_id", sqs.map((sq) => sq.id).length ? sqs.map((sq) => sq.id) : [""])
      .order("created_at");

    // Answers are never overwritten — the latest row per person is the one that counts.
    const latest = new Map<string, string>();
    for (const row of answerRows ?? []) {
      latest.set(`${row.session_question_id}:${row.participant_id}`, row.option_key);
    }

    const { data: myConnections } = await supabaseAdmin
      .from("connections")
      .select("target_participant_id")
      .eq("owner_participant_id", me.id);
    const connected = new Set((myConnections ?? []).map((c) => c.target_participant_id));

    const currentSq = sqs[session.current_index];
    let current: {
      sessionQuestionId: string;
      questionId: string;
      text: string;
      options: { key: OptionKey; label: string }[];
      revealed: boolean;
      myAnswer: OptionKey | null;
      answeredCount: number;
      picks: { participantId: string; name: string; isMe: boolean; optionKey: OptionKey }[];
      minority: string;
      ask: string;
    } | null = null;

    if (currentSq) {
      const snap = currentSq.snapshot as Snapshot;
      const picks = players
        .map((p) => {
          const key = latest.get(`${currentSq.id}:${p.participantId}`);
          return key
            ? { participantId: p.participantId, name: p.name, isMe: p.isMe, optionKey: key as OptionKey }
            : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const revealed = Boolean(currentSq.revealed_at);
      const byOption = new Map<OptionKey, typeof picks>();
      for (const pick of picks) {
        byOption.set(pick.optionKey, [...(byOption.get(pick.optionKey) ?? []), pick]);
      }
      const groups = [...byOption.values()].sort((a, b) => b.length - a.length);
      const small = groups.length > 1 ? groups[groups.length - 1]! : [];
      const isMinority = revealed && small.length > 0 && small.length <= 2 && small.length < groups[0]!.length;
      const minorityNames = isMinority ? small.map((p) => p.name) : [];
      const iAmMinority = isMinority && small.some((p) => p.isMe);

      current = {
        sessionQuestionId: currentSq.id,
        questionId: currentSq.question_id,
        text: snap.text,
        options: snap.options,
        revealed,
        myAnswer: (latest.get(`${currentSq.id}:${me.id}`) as OptionKey | undefined) ?? null,
        answeredCount: picks.length,
        picks: revealed ? picks : [],
        minority: minorityNames.length ? minorityLine(minorityNames) : "",
        // The nudge to speak lands on everyone except the person in the minority.
        ask: minorityNames.length && !iAmMinority ? askLine(minorityNames) : "",
      };
    }

    // End screen: plain counts of where each person landed differently from me.
    const differences = players
      .filter((p) => !p.isMe)
      .map((p) => {
        let count = 0;
        let topQuestion = "";
        let topQuestionId = "";
        for (const sq of sqs) {
          const mine = latest.get(`${sq.id}:${me.id}`);
          const theirs = latest.get(`${sq.id}:${p.participantId}`);
          if (!mine || !theirs || mine === theirs) continue;
          count += 1;
          if (!topQuestionId) {
            topQuestionId = sq.id;
            topQuestion = (sq.snapshot as Snapshot).text;
          }
        }
        return {
          participantId: p.participantId,
          name: p.name,
          count,
          topQuestion,
          topSessionQuestionId: topQuestionId,
          connected: connected.has(p.participantId),
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      sessionId: session.id,
      roomCode: session.room_code ?? "",
      status: session.status,
      currentIndex: session.current_index,
      total: sqs.length,
      me: { participantId: me.id, name: me.display_name ?? "You" },
      iAmHost: isHostRole(me.role),
      iAmPlaying: me.role !== OBSERVER_ROLE,
      participants: everyone.map((p) => ({ ...p, connected: connected.has(p.participantId) })),
      playerCount: players.length,
      current,
      differences,
      hostRequest: pendingRequest
        ? {
            id: pendingRequest.id,
            secondsLeft: pendingRequest.secondsLeft,
            name:
              everyone.find((p) => p.participantId === pendingRequest.requesterParticipantId)?.name ??
              "Someone",
            isMine: pendingRequest.requesterParticipantId === me.id,
          }
        : null,
    };
  });

export const startGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can start");
    await supabaseAdmin
      .from("sessions")
      .update({ status: "answering", current_index: 0 })
      .eq("id", data.sessionId);
    return { ok: true };
  });

export const answerInGroup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
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

    const me = await groupMember(supabaseAdmin, sq.session_id, data.guestToken);
    if (me.role === OBSERVER_ROLE) throw new Error("You're running this one, not playing");

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      visibility: "session",
      answer_role: "about_self",
    });
    if (error) throw error;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: "answer_submitted",
      props: { question_id: sq.question_id, kind: "group" },
    });

    return { ok: true };
  });

/** Host-only, always allowed: a missing or departed person never blocks the room. */
export const revealGroupQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can reveal");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("current_index")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Room is gone");

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, revealed_at")
      .eq("session_id", data.sessionId)
      .eq("order_index", session.current_index)
      .maybeSingle();
    if (!sq) throw new Error("Nothing to reveal");

    if (!sq.revealed_at) {
      await supabaseAdmin
        .from("session_questions")
        .update({ revealed_at: new Date().toISOString() })
        .eq("id", sq.id);
    }
    await supabaseAdmin.from("sessions").update({ status: "revealed" }).eq("id", data.sessionId);
    return { ok: true };
  });

export const nextGroupQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can move on");

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("current_index")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Room is gone");

    const { count } = await supabaseAdmin
      .from("session_questions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId);

    const next = session.current_index + 1;
    if (next >= (count ?? 0)) {
      await supabaseAdmin
        .from("sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", data.sessionId);
      return { ended: true };
    }

    await supabaseAdmin
      .from("sessions")
      .update({ current_index: next, status: "answering" })
      .eq("id", data.sessionId);
    return { ended: false };
  });

export const endGroupSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can end this");
    await supabaseAdmin
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return { ok: true };
  });

export const requestHost = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (isHostRole(me.role)) return { ok: true };

    const { data: open } = await supabaseAdmin
      .from("host_requests")
      .select("id")
      .eq("session_id", data.sessionId)
      .eq("status", "pending")
      .maybeSingle();
    if (open) return { ok: true };

    await supabaseAdmin
      .from("host_requests")
      .insert({ session_id: data.sessionId, requester_participant_id: me.id });
    return { ok: true };
  });

export const declineHostRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid(), requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can decline");
    await supabaseAdmin
      .from("host_requests")
      .update({ status: "declined", resolved_at: new Date().toISOString() })
      .eq("id", data.requestId)
      .eq("session_id", data.sessionId);
    return { ok: true };
  });

export const handOffHost = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        toParticipantId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (!isHostRole(me.role)) throw new Error("Only the host can hand this over");
    await transferHost(supabaseAdmin, data.sessionId, data.toParticipantId);
    await supabaseAdmin
      .from("host_requests")
      .update({ status: "granted", resolved_at: new Date().toISOString() })
      .eq("session_id", data.sessionId)
      .eq("status", "pending");
    return { ok: true };
  });

export const addConnection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        targetParticipantId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);
    if (me.id === data.targetParticipantId) return { ok: true };
    await supabaseAdmin.from("connections").upsert(
      {
        session_id: data.sessionId,
        owner_participant_id: me.id,
        target_participant_id: data.targetParticipantId,
      },
      { onConflict: "owner_participant_id,target_participant_id" },
    );
    return { ok: true };
  });

/** End of a group session: carry one question into a 1:1 and hand back a link. */
export const startOneOnOne = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        withParticipantId: z.string().uuid(),
        sessionQuestionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await groupMember(supabaseAdmin, data.sessionId, data.guestToken);

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, question_id, snapshot")
      .eq("id", data.sessionQuestionId)
      .eq("session_id", data.sessionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const { data: them } = await supabaseAdmin
      .from("session_participants")
      .select("display_name")
      .eq("id", data.withParticipantId)
      .maybeSingle();

    const { data: myAnswer } = await supabaseAdmin
      .from("answers")
      .select("option_key")
      .eq("session_question_id", sq.id)
      .eq("participant_id", me.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "remote", status: "active" })
      .select("id")
      .single();
    if (error) throw error;

    const { data: sender, error: pError } = await supabaseAdmin
      .from("session_participants")
      .insert({
        session_id: session.id,
        guest_token: data.guestToken,
        display_name: me.display_name ?? "A friend",
        role: "sender",
      })
      .select("id")
      .single();
    if (pError) throw pError;

    const { data: newSq, error: sqError } = await supabaseAdmin
      .from("session_questions")
      .insert({
        session_id: session.id,
        question_id: sq.question_id,
        order_index: 0,
        snapshot: sq.snapshot as never,
      })
      .select("id")
      .single();
    if (sqError) throw sqError;

    if (myAnswer) {
      await supabaseAdmin.from("answers").insert({
        session_question_id: newSq.id,
        participant_id: sender.id,
        question_id: sq.question_id,
        option_key: myAnswer.option_key,
        visibility: "session",
      });
    }

    const token = shortToken();
    const { error: iError } = await supabaseAdmin.from("invites").insert({
      session_id: session.id,
      inviter_participant_id: sender.id,
      token,
      recipient_label: them?.display_name ?? null,
    });
    if (iError) throw iError;

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "invite_created",
      props: { count: 1, from: "group" },
    });

    return { token };
  });

export type GroupState = Awaited<ReturnType<typeof getGroupState>>;

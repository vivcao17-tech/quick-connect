import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { snapshotOf, toPlay } from "@/lib/remote-shared";
import type { OptionKey, Snapshot } from "@/lib/remote-shared";

const guest = z.string().uuid();

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let out = "";
  for (const byte of bytes) out += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return out;
}

const QUESTION_SELECT =
  "id, topic_id, text, option_a, option_b, option_c, spice_level, reason_chips(id, option_key, text)";

type QuestionRow = {
  id: string;
  topic_id: string | null;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  spice_level: number;
  reason_chips: { id: string; option_key: string; text: string }[] | null;
};

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
        .in("status", ["lobby", "topic_select", "question_select", "answering", "revealed"])
        .maybeSingle();
      if (!taken) break;
      code = roomCode();
    }

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({ kind: "irl_pair", status: "lobby", room_code: code, current_index: 0 })
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
      .select("id, status")
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

    if (session.status === "lobby") {
      await supabaseAdmin
        .from("sessions")
        .update({ status: "topic_select" })
        .eq("id", session.id);
    }

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: session.id,
      name: "participant_joined",
      props: { session_id: session.id, is_guest: true },
    });

    return { sessionId: session.id, participantId: participant.id };
  });

async function memberOf(
  admin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  sessionId: string,
  guestToken: string,
) {
  const { data: participant } = await admin
    .from("session_participants")
    .select("id, display_name, role")
    .eq("session_id", sessionId)
    .eq("guest_token", guestToken)
    .maybeSingle();
  if (!participant) throw new Error("Not in this room");
  return participant;
}

/** Candidate questions: intersection of both people's topics, otherwise one from each side. */
async function candidateQuestions(
  admin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  sessionId: string,
  spiceMax: number,
) {
  const { data: picks } = await admin
    .from("session_participant_topics")
    .select("participant_id, topic_id")
    .eq("session_id", sessionId);

  const byParticipant = new Map<string, Set<string>>();
  for (const row of picks ?? []) {
    if (!byParticipant.has(row.participant_id)) byParticipant.set(row.participant_id, new Set());
    byParticipant.get(row.participant_id)!.add(row.topic_id);
  }
  const sets = [...byParticipant.values()];
  if (sets.length === 0) return [] as QuestionRow[];

  const union = [...new Set(sets.flatMap((s) => [...s]))];
  const intersection = union.filter((id) => sets.every((s) => s.has(id)));

  const { data: rows } = await admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .lte("spice_level", spiceMax)
    .in("topic_id", union.length ? union : ["00000000-0000-0000-0000-000000000000"])
    .order("id");

  const all = ((rows as QuestionRow[] | null) ?? []).filter(Boolean);
  if (intersection.length > 0) {
    const shared = all.filter((q) => q.topic_id && intersection.includes(q.topic_id));
    if (shared.length >= 3) return shared.slice(0, 3);
    const rest = all.filter((q) => !shared.includes(q));
    return [...shared, ...rest].slice(0, 3);
  }

  // No overlap — take them evenly from each person's topics.
  const picked: QuestionRow[] = [];
  let round = 0;
  while (picked.length < 3 && round < 6) {
    for (const set of sets) {
      const next = all.find((q) => q.topic_id && set.has(q.topic_id) && !picked.includes(q));
      if (next && picked.length < 3) picked.push(next);
    }
    round += 1;
  }
  return picked.slice(0, 3);
}

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ guestToken: guest, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await memberOf(supabaseAdmin, data.sessionId, data.guestToken);

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id, room_code, status, current_index, spice_max")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Room is gone");

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name, role, joined_at")
      .eq("session_id", data.sessionId)
      .order("joined_at");

    const people = (participants ?? []).map((p) => ({
      participantId: p.id,
      name: p.display_name ?? "Someone",
      isMe: p.id === me.id,
    }));
    const others = people.filter((p) => !p.isMe);

    const { data: topics } = await supabaseAdmin
      .from("topics")
      .select("id, slug, label")
      .eq("active", true)
      .order("sort_order");

    const { data: topicPicks } = await supabaseAdmin
      .from("session_participant_topics")
      .select("participant_id, topic_id")
      .eq("session_id", data.sessionId);

    const topicCount = new Map<string, number>();
    for (const row of topicPicks ?? []) {
      topicCount.set(row.participant_id, (topicCount.get(row.participant_id) ?? 0) + 1);
    }
    const myTopicIds = (topicPicks ?? [])
      .filter((row) => row.participant_id === me.id)
      .map((row) => row.topic_id);

    const candidates =
      session.status === "question_select"
        ? await candidateQuestions(supabaseAdmin, data.sessionId, session.spice_max)
        : [];

    const { data: votes } = await supabaseAdmin
      .from("session_question_votes")
      .select("participant_id, question_id")
      .eq("session_id", data.sessionId);
    const voteCount = new Map<string, number>();
    for (const row of votes ?? []) {
      voteCount.set(row.participant_id, (voteCount.get(row.participant_id) ?? 0) + 1);
    }

    const { data: sqs } = await supabaseAdmin
      .from("session_questions")
      .select("id, question_id, order_index, revealed_at, snapshot")
      .eq("session_id", data.sessionId)
      .order("order_index");

    const sqIds = (sqs ?? []).map((sq) => sq.id);
    const { data: answers } = sqIds.length
      ? await supabaseAdmin
          .from("answers")
          .select("session_question_id, participant_id, option_key, created_at")
          .in("session_question_id", sqIds)
          .order("created_at")
      : { data: [] as { session_question_id: string; participant_id: string; option_key: string }[] };

    const questions = (sqs ?? []).map((sq) => {
      const snap = sq.snapshot as Snapshot;
      const revealed = sq.revealed_at !== null;
      const rows = (answers ?? []).filter((a) => a.session_question_id === sq.id);
      const latest = new Map<string, string>();
      for (const row of rows) latest.set(row.participant_id, row.option_key);
      const mine = latest.get(me.id) ?? null;
      return {
        sessionQuestionId: sq.id,
        questionId: sq.question_id,
        text: snap.text,
        options: snap.options,
        revealed,
        myAnswer: mine as OptionKey | null,
        answeredCount: latest.size,
        // Other people's picks are withheld until the row is revealed.
        picks: revealed
          ? people.map((p) => ({
              name: p.name,
              isMe: p.isMe,
              optionKey: (latest.get(p.participantId) ?? null) as OptionKey | null,
              label:
                snap.options.find((o) => o.key === latest.get(p.participantId))?.label ?? "—",
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
      candidates: candidates.map((q) => ({ id: q.id, text: q.text })),
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

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "topics_selected",
      props: { count: data.topicIds.length },
    });

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", data.sessionId);
    const { data: picks } = await supabaseAdmin
      .from("session_participant_topics")
      .select("participant_id")
      .eq("session_id", data.sessionId);

    const done = new Map<string, number>();
    for (const row of picks ?? []) done.set(row.participant_id, (done.get(row.participant_id) ?? 0) + 1);
    const everyone =
      (participants ?? []).length >= 2 &&
      (participants ?? []).every((p) => (done.get(p.id) ?? 0) >= 2);

    if (everyone) {
      await supabaseAdmin
        .from("sessions")
        .update({ status: "question_select" })
        .eq("id", data.sessionId)
        .eq("status", "topic_select");
    }
    return { advanced: everyone };
  });

export const voteQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestToken: guest,
        sessionId: z.string().uuid(),
        questionIds: z.array(z.string().uuid()).min(1).max(3),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = await memberOf(supabaseAdmin, data.sessionId, data.guestToken);

    await supabaseAdmin.from("session_question_votes").delete().eq("participant_id", me.id);
    const { error } = await supabaseAdmin.from("session_question_votes").insert(
      data.questionIds.map((questionId) => ({
        session_id: data.sessionId,
        participant_id: me.id,
        question_id: questionId,
      })),
    );
    if (error) throw error;

    const { data: participants } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", data.sessionId);
    const { data: votes } = await supabaseAdmin
      .from("session_question_votes")
      .select("participant_id, question_id")
      .eq("session_id", data.sessionId);

    const voters = new Set((votes ?? []).map((v) => v.participant_id));
    const everyone =
      (participants ?? []).length >= 2 && (participants ?? []).every((p) => voters.has(p.id));
    if (!everyone) return { advanced: false };

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (session?.status !== "question_select") return { advanced: true };

    const tally = new Map<string, number>();
    for (const v of votes ?? []) tally.set(v.question_id, (tally.get(v.question_id) ?? 0) + 1);
    const ordered = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const chosen = ordered.slice(0, 3);

    const { data: rows } = await supabaseAdmin
      .from("questions")
      .select(QUESTION_SELECT)
      .in("id", chosen);
    const bank = (rows as QuestionRow[] | null) ?? [];

    await supabaseAdmin.from("session_questions").insert(
      chosen.map((id, index) => {
        const q = bank.find((row) => row.id === id)!;
        return {
          session_id: data.sessionId,
          question_id: id,
          order_index: index,
          snapshot: snapshotOf({ ...q, chips: q.reason_chips ?? [] }) as never,
        };
      }),
    );

    await supabaseAdmin
      .from("sessions")
      .update({ status: "answering", current_index: 0 })
      .eq("id", data.sessionId)
      .eq("status", "question_select");

    return { advanced: true };
  });

export const answerInRoom = createServerFn({ method: "POST" })
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
      .select("id, session_id, question_id, revealed_at")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");

    const me = await memberOf(supabaseAdmin, sq.session_id, data.guestToken);

    const { error } = await supabaseAdmin.from("answers").insert({
      session_question_id: sq.id,
      participant_id: me.id,
      question_id: sq.question_id,
      option_key: data.optionKey,
      visibility: "session",
    });
    if (error) throw error;

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
      await supabaseAdmin
        .from("sessions")
        .update({ status: "topic_select" })
        .eq("id", data.sessionId);
      await supabaseAdmin
        .from("session_participant_topics")
        .delete()
        .eq("session_id", data.sessionId);
      await supabaseAdmin
        .from("session_question_votes")
        .delete()
        .eq("session_id", data.sessionId);
      return { status: "topic_select" as const };
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
    if (nextIndex >= total) {
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
    await memberOf(supabaseAdmin, data.sessionId, data.guestToken);
    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: data.sessionId,
      name: "session_save_requested",
      props: { email: data.email },
    });
    return { ok: true };
  });

export type RoomState = Awaited<ReturnType<typeof getRoomState>>;

// toPlay stays imported for shape parity with remote mode snapshots.
void toPlay;

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Snapshot } from "@/lib/remote-shared";

const identity = {
  guestToken: z.string().uuid(),
  profileId: z.string().uuid().optional(),
};

export type TimelineQuestion = {
  id: string;
  type: "question";
  timestamp: string;
  data: {
    sessionQuestionId: string;
    sessionId: string;
    text: string;
    kind: "standard" | "impression" | "prediction";
    pack: string | null;
    followUp: string;
    /** waiting_them: I answered, they haven't. waiting_me: my turn. revealed: both. */
    state: "waiting_them" | "waiting_me" | "revealed";
    /** Only while waiting_me — the options I pick from. Never anyone's choice. */
    options: { key: string; label: string }[];
    stemSelf: string;
    stemOther: string;
    /** For impression questions answered halfway: which half is still open. */
    needs: "about_self" | "about_other" | null;
    // Everything below is empty unless state === "revealed".
    myLabel: string;
    myReason: string;
    theirLabel: string;
    theirReason: string;
    myGuess: string;
    theirGuess: string;
    matched: boolean | null;
    revealedAt: string;
  };
};
export type TimelineMessage = {
  id: string;
  type: "message";
  timestamp: string;
  data: {
    /** Set only when sent from a question's Talk; shown as a quoted line. */
    sessionQuestionId: string | null;
    quote: string;
    kind: string;
    body: string;
    mine: boolean;
  };
};
export type TimelineSystem = {
  id: string;
  type: "system";
  timestamp: string;
  data: { text: string };
};
export type TimelineItem = TimelineQuestion | TimelineMessage | TimelineSystem;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Everything between me and one person, in time order. Server decides what's revealed. */
async function buildTimeline(data: {
  guestToken: string;
  profileId?: string | undefined;
  personKey: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };
  const { myParticipants } = await import("@/lib/identity.server");
  const { personKeyOf, guestPersonKey } = await import("@/lib/conversations.server");
  const { loadNotes } = await import("@/lib/notes.server");

  const legacy = guestPersonKey(data.personKey);
  const ident = { guestToken: data.guestToken, profileId: data.profileId };
  const [mine, notes] = await Promise.all([myParticipants(admin, ident), loadNotes(admin, ident)]);
  const sessionIds = [...new Set(mine.map((p) => p.session_id))];
  const empty = { personKey: data.personKey, name: "", items: [] as TimelineItem[], pairQs: [] };
  console.log("DBG mine", mine.length, Boolean(data.profileId));
  if (sessionIds.length === 0) return empty;

  const { data: everyone } = await admin
    .from("session_participants")
    .select("id, session_id, role, display_name, profile_id, guest_token")
    .in("session_id", sessionIds);
  const myIds = new Set(mine.map((p) => p.id));
  // Old links carry a participant id; resolve it to that person's key.
  const byId = ((everyone ?? []) as Row[]).find(
    (p) => p.id === data.personKey && !myIds.has(p.id),
  );
  const wanted = byId ? personKeyOf(byId as never) : data.personKey;
  const partners = ((everyone ?? []) as Row[]).filter((p) => {
    if (myIds.has(p.id)) return false;
    const key = personKeyOf(p as never);
    return key === wanted || key === legacy;
  });
  console.log("DBG conv", mine.length, (everyone ?? []).length, partners.length, wanted, Boolean(data.profileId));
  if (partners.length === 0) return empty;
  const personKey = personKeyOf(partners[0] as never);
  const realName = partners.find((p) => p.display_name)?.display_name ?? "Someone";
  const name = notes.get(personKey)?.nickname || realName;

  const ids = [...new Set(partners.map((p) => p.session_id as string))];
  const [{ data: sqRows }, { data: sessionRows }] = await Promise.all([
    admin
      .from("session_questions")
      .select("id, session_id, question_id, revealed_at, order_index, snapshot")
      .in("session_id", ids),
    admin.from("sessions").select("id, kind, created_at").in("id", ids),
  ]);
  const sqs = (sqRows ?? []) as Row[];
  const sqIds = sqs.map((q) => q.id);
  const qIds = [...new Set(sqs.map((q) => q.question_id))];
  const NIL = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: answerRows }, { data: messageRows }, { data: qRows }, { data: looseRows }] =
    await Promise.all([
      admin
        .from("answers")
        .select(
          "session_question_id, participant_id, option_key, reason_text, answer_role, created_at",
        )
        .in("session_question_id", sqIds.length ? sqIds : NIL)
        .order("created_at"),
      admin
        .from("thread_messages")
        .select("id, session_question_id, participant_id, kind, body, created_at")
        .in("session_question_id", sqIds.length ? sqIds : NIL)
        .order("created_at"),
      admin
        .from("questions")
        .select("id, pack, question_type")
        .in("id", qIds.length ? qIds : NIL),
      admin
        .from("thread_messages")
        .select("id, session_question_id, participant_id, kind, body, created_at")
        .in("session_id", ids)
        .is("session_question_id", null)
        .order("created_at"),
    ]);
  const answers = (answerRows ?? []) as Row[];
  const qMeta = new Map(((qRows ?? []) as Row[]).map((q) => [q.id, q]));
  const sessionAt = new Map(((sessionRows ?? []) as Row[]).map((s) => [s.id, s]));

  const items: TimelineItem[] = [];
  const revealedIds = new Set<string>();
  const pairQs: {
    sessionId: string;
    sessionQuestionId: string;
    questionId: string;
    text: string;
    revealed: boolean;
    myLabel: string;
    theirLabel: string;
    myReason: string;
    theirReason: string;
    matched: boolean | null;
    kind: string;
  }[] = [];

  for (const sq of sqs) {
    const me = mine.find((p) => p.session_id === sq.session_id);
    const them = partners.find((p) => p.session_id === sq.session_id);
    const snap = sq.snapshot as Snapshot | null;
    if (!me || !them || !snap) continue;
    const kind = snap.kind ?? "standard";
    const latest = (pid: string, role: string) =>
      [...answers]
        .reverse()
        .find(
          (a) =>
            a.session_question_id === sq.id &&
            a.participant_id === pid &&
            (role === "about_other"
              ? a.answer_role === "about_other"
              : a.answer_role !== "about_other"),
        );
    const mySelf = latest(me.id, "about_self");
    const myOther = latest(me.id, "about_other");
    const theirSelf = latest(them.id, "about_self");
    const revealed = Boolean(sq.revealed_at);
    const label = (key?: string) => snap.options.find((o) => o.key === key)?.label ?? "";
    const times = answers
      .filter((a) => a.session_question_id === sq.id)
      .map((a) => a.created_at as string)
      .sort();
    const sentAt = times[0] ?? sessionAt.get(sq.session_id)?.created_at ?? "";

    let state: TimelineQuestion["data"]["state"];
    let needs: TimelineQuestion["data"]["needs"] = null;
    const myDone = kind === "impression" ? Boolean(mySelf && myOther) : Boolean(mySelf);
    if (revealed) state = "revealed";
    else if (myDone) state = "waiting_them";
    else if (me.role === "recipient" && theirSelf) {
      state = "waiting_me";
      needs = mySelf ? "about_other" : "about_self";
    } else continue; // Nobody has answered yet — nothing to show.

    const meta = qMeta.get(sq.question_id);
    const theirOther = revealed ? latest(them.id, "about_other") : undefined;
    const theirs = revealed ? theirSelf : undefined;
    items.push({
      id: `q:${sq.id}`,
      type: "question",
      timestamp: sentAt,
      data: {
        sessionQuestionId: sq.id,
        sessionId: sq.session_id,
        text: snap.text,
        kind,
        pack: meta?.pack ?? null,
        followUp: snap.followUp ?? "",
        state,
        options: state === "waiting_me" ? snap.options : [],
        stemSelf: snap.stemSelf ?? "",
        stemOther: snap.stemOther ?? "",
        needs,
        myLabel: revealed ? label(mySelf?.option_key) : "",
        myReason: revealed ? (mySelf?.reason_text ?? "") : "",
        theirLabel: label(theirs?.option_key),
        theirReason: theirs?.reason_text ?? "",
        myGuess: revealed ? label(myOther?.option_key) : "",
        theirGuess: label(theirOther?.option_key),
        matched: revealed && mySelf && theirs ? mySelf.option_key === theirs.option_key : null,
        revealedAt: sq.revealed_at ?? "",
      },
    });
    pairQs.push({
      sessionId: sq.session_id,
      sessionQuestionId: sq.id,
      questionId: sq.question_id,
      text: snap.text,
      revealed,
      myLabel: revealed ? label(mySelf?.option_key) : "",
      theirLabel: label(theirs?.option_key),
      myReason: revealed ? (mySelf?.reason_text ?? "") : "",
      theirReason: theirs?.reason_text ?? "",
      matched: revealed && mySelf && theirs ? mySelf.option_key === theirs.option_key : null,
      kind,
    });
    if (revealed) revealedIds.add(sq.id);
  }

  const partnerIds = new Set(partners.map((p) => p.id as string));
  const sqText = new Map(sqs.map((q) => [q.id as string, (q.snapshot as Snapshot | null)?.text ?? ""]));
  for (const m of [...((messageRows ?? []) as Row[]), ...((looseRows ?? []) as Row[])]) {
    // Replies stay hidden until their question is revealed; standalone messages always show.
    if (m.session_question_id && !revealedIds.has(m.session_question_id)) continue;
    if (!myIds.has(m.participant_id) && !partnerIds.has(m.participant_id)) continue;
    items.push({
      id: `m:${m.id}`,
      type: "message",
      timestamp: m.created_at,
      data: {
        sessionQuestionId: m.session_question_id ?? null,
        quote: m.session_question_id ? (sqText.get(m.session_question_id) ?? "") : "",
        kind: m.kind,
        body: m.body ?? "",
        mine: myIds.has(m.participant_id),
      },
    });
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  // Opening the conversation reads every thread in it.
  const now = new Date().toISOString();
  const reads = [...revealedIds].flatMap((sqId) => {
    const me = mine.find((p) => p.session_id === sqs.find((q) => q.id === sqId)?.session_id);
    return me ? [{ participant_id: me.id, session_question_id: sqId, read_at: now }] : [];
  });

  return { personKey, name, items, pairQs, reads };
}

/** Header line: what's unlocked, and how far the next pack is. */
async function packLine(pairQs: Awaited<ReturnType<typeof buildTimeline>>["pairQs"]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { packPreview, nextPack } = await import("@/lib/packs.server");
  const packs = await packPreview(supabaseAdmin as never, pairQs);
  const unlocked = packs.filter((p) => p.unlocked).map((p) => `${p.label} unlocked`);
  const next =
    packs.find((p) => !p.unlocked && p.pack !== "clash") ?? packs.find((p) => !p.unlocked);
  let tail = "";
  if (next) {
    const another = packs.some((p) => p.pack !== "clash" && p.unlocked);
    if (next.pack === "clash" && !another) tail = "Clash opens after you unlock another one";
    else {
      const rounds = Math.ceil(Math.max(0, next.threshold - next.answered) / 2);
      tail = `${next.label} needs ${rounds === 1 ? "one more round" : rounds === 2 ? "two more rounds" : "a few more rounds"}`;
    }
  }
  return { line: [...unlocked, tail].filter(Boolean).join(" · "), next: nextPack(packs), packs };
}

export const getConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...identity,
        personKey: z.string().min(1).max(80),
        before: z.string().optional(),
        focus: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const built = await buildTimeline(data);
    const all = built.items;
    let start: number;
    let end = all.length;
    if (data.before) {
      end = all.findIndex((item) => item.timestamp >= data.before!);
      if (end < 0) end = all.length;
      start = Math.max(0, end - 30);
    } else {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      start = all.findIndex((item) => item.timestamp >= cutoff);
      if (start < 0) start = all.length;
      start = Math.min(start, Math.max(0, all.length - 15));
      if (data.focus) {
        const at = all.findIndex(
          (i) => i.type === "question" && i.data.sessionQuestionId === data.focus,
        );
        if (at >= 0) start = Math.min(start, at);
      }
    }
    const items = all.slice(start, end);

    let header = { line: "", next: "click" as string };
    if (!data.before && "reads" in built) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [h] = await Promise.all([
        packLine(built.pairQs),
        built.reads.length
          ? supabaseAdmin
              .from("thread_reads")
              .upsert(built.reads, { onConflict: "participant_id,session_question_id" })
          : null,
      ]);
      header = { line: h.line, next: h.next };
    }
    return {
      personKey: built.personKey,
      name: built.name,
      header,
      items,
      hasMore: start > 0,
      mutualCount: built.pairQs.filter((q) => q.revealed && q.kind !== "impression").length,
    };
  });

/** Person page: impression results between these two only. */
export const getPairImpressions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...identity, personKey: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const built = await buildTimeline(data);
    return {
      items: built.items
        .filter(
          (i): i is TimelineQuestion =>
            i.type === "question" && i.data.kind === "impression" && i.data.state === "revealed",
        )
        .map((i) => i.data)
        .reverse(),
    };
  });

/** Answer a question from inside the conversation — same save and reveal path as the invite page. */
export const answerInConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...identity,
        sessionQuestionId: z.string().uuid(),
        optionKey: z.enum(["a", "b", "c"]),
        answerRole: z.enum(["about_self", "about_other"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myParticipantIn } = await import("@/lib/identity.server");
    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("session_id")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq) throw new Error("Unknown question");
    const me = await myParticipantIn(supabaseAdmin as never, sq.session_id, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });
    if (!me || me.role !== "recipient" || !me.guest_token) throw new Error("Not your question");
    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("token")
      .eq("child_session_id", sq.session_id)
      .maybeSingle();
    if (!invite) throw new Error("Not your question");
    const { answerAsRecipient } = await import("@/lib/remote.functions");
    const result = await answerAsRecipient({
      data: {
        token: invite.token,
        guestToken: me.guest_token,
        sessionQuestionId: data.sessionQuestionId,
        optionKey: data.optionKey,
        ...(data.answerRole ? { answerRole: data.answerRole } : {}),
      },
    });
    return { revealed: result.revealed, needsSecondHalf: result.needsSecondHalf };
  });

/** A prompt for a pack (or any pack), from conversation_prompts. */
export const getConversationPrompt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ pack: z.string().max(20).nullable().optional(), skip: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as unknown as { from: (t: string) => any })
      .from("conversation_prompts")
      .select("text")
      .eq("active", true);
    if (data.pack) query = query.eq("pack", data.pack);
    const { data: rows } = await query;
    const pool = ((rows ?? []) as { text: string }[])
      .map((r) => r.text)
      .filter((t) => t !== data.skip);
    return {
      text: pool[Math.floor(Math.random() * pool.length)] ?? "What's the story behind that?",
    };
  });

/** A message to one person. No question needed; a reference only when sent from Talk. */
export const postConversationMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...identity,
        personKey: z.string().min(1).max(80),
        sessionQuestionId: z.string().uuid().optional(),
        kind: z.enum(["reaction", "text"]),
        body: z.string().min(1).max(240),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const { myParticipants } = await import("@/lib/identity.server");
    const { personKeyOf, guestPersonKey } = await import("@/lib/conversations.server");
    const ident = { guestToken: data.guestToken, profileId: data.profileId };
    const mine = await myParticipants(admin as never, ident);
    const sessionIds = [...new Set(mine.map((p) => p.session_id))];
    if (!sessionIds.length) throw new Error("Not your conversation");
    const { data: everyone } = await admin
      .from("session_participants")
      .select("id, session_id, profile_id, guest_token")
      .in("session_id", sessionIds);
    const myIds = new Set(mine.map((p) => p.id));
    const legacy = guestPersonKey(data.personKey);
    const shared = new Set(
      ((everyone ?? []) as Row[])
        .filter((p) => !myIds.has(p.id))
        .filter((p) => {
          const key = personKeyOf(p as never);
          return key === data.personKey || key === legacy;
        })
        .map((p) => p.session_id as string),
    );
    if (!shared.size) throw new Error("Not your conversation");

    let sessionId: string;
    let sessionQuestionId: string | null = null;
    if (data.sessionQuestionId) {
      const { data: sq } = await admin
        .from("session_questions")
        .select("id, session_id, revealed_at")
        .eq("id", data.sessionQuestionId)
        .maybeSingle();
      if (!sq || !shared.has(sq.session_id) || !sq.revealed_at) throw new Error("Not your question");
      sessionId = sq.session_id;
      sessionQuestionId = sq.id;
    } else {
      const { data: latest } = await admin
        .from("sessions")
        .select("id")
        .in("id", [...shared])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionId = latest?.id ?? [...shared][0]!;
    }
    const me = mine.find((p) => p.session_id === sessionId)!;
    const { error } = await admin.from("thread_messages").insert({
      session_id: sessionId,
      session_question_id: sessionQuestionId,
      participant_id: me.id,
      kind: data.kind,
      body: data.body,
    });
    if (error) throw error;
    await admin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sessionId,
      name: data.kind === "reaction" ? "reaction_added" : "thread_message_sent",
      props: { kind: data.kind, standalone: !sessionQuestionId },
    });
    return { ok: true };
  });

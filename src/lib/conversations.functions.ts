import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const guest = z.string().uuid();
const identity = {
  guestToken: guest,
  profileId: z.string().uuid().optional(),
};

/**
 * Every person you've shared a revealed block with, plus the links that are
 * still out there waiting. Waiting comes first in the UI — it is the window
 * where people come back to check.
 *
 * One round trip: relationships_detail() does the identity matching, answer
 * pairing and unread counting inside Postgres. The old loadRelationships loop
 * ran ~12 sequential PostgREST calls at 150–600ms of network each.
 */
export const listConversations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDetail } = await import("@/lib/relationships.server");
    const { linkProfileToGuestRows } = await import("@/lib/identity.server");

    // Stamps profile ids onto old guest rows; the detail matches either key,
    // so it doesn't need to wait for the write.
    const linking = linkProfileToGuestRows(supabaseAdmin as never, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });

    const detail = await loadDetail(supabaseAdmin as never, data.guestToken, data.profileId);
    await linking;

    return {
      waiting: detail.waiting,
      people: detail.people
        .filter((person) => person.sessions.some((session) => session.revealed))
        .map((person) => ({
          personKey: person.personKey,
          name: person.nickname || person.name,
          latestQuestion: person.sessions[0]?.questions[0]?.text ?? "",
          lastActivity: person.sessions[0]?.lastActivity ?? "",
          unread: person.sessions.reduce((sum, session) => sum + session.unread, 0),
        })),
    };
  });

/** Every session (3-question block) shared with one person, newest first. */
export const getPersonSessions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...identity, personKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDetail, metLabel } = await import("@/lib/relationships.server");

    const detail = await loadDetail(supabaseAdmin as never, data.guestToken, data.profileId);
    const person = detail.people.find((p) => p.personKey === data.personKey);
    if (!person) {
      return {
        name: "",
        realName: "",
        note: { nickname: "", contact: "", note: "" },
        met: "",
        sessions: [],
      };
    }
    const oldest = person.sessions[person.sessions.length - 1];
    return {
      name: person.nickname || person.name,
      realName: person.name,
      note: { nickname: person.nickname, contact: person.contact, note: person.note },
      met: oldest ? metLabel(oldest.kind) : "",
      sessions: person.sessions.map((session) => ({
        sessionId: session.sessionId,
        topic: session.topic,
        total: session.total,
        different: session.different,
        messageCount: session.messageCount,
        unread: session.unread,
        lastActivity: session.lastActivity,
        questions: session.questions,
      })),
    };
  });

/** The questions inside one shared session, with both answers and thread counts. */
export const getSessionBlock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ ...identity, personKey: z.string().min(1), sessionId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDetail } = await import("@/lib/relationships.server");

    const detail = await loadDetail(supabaseAdmin as never, data.guestToken, data.profileId);
    const person = detail.people.find((p) => p.personKey === data.personKey);
    const session = person?.sessions.find((s) => s.sessionId === data.sessionId);
    if (!person || !session) return { name: "", topic: "", questions: [] };
    return {
      name: person.nickname || person.name,
      topic: session.topic,
      questions: session.questions,
    };
  });

/**
 * Unread thread replies, flattened to one row per question so the home page can
 * deep-link straight into the thread that has something new in it.
 */
export const listUnreadThreads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadDetail } = await import("@/lib/relationships.server");

    const detail = await loadDetail(supabaseAdmin as never, data.guestToken, data.profileId);
    const items = detail.people.flatMap((person) =>
      person.sessions.flatMap((session) =>
        session.questions
          .filter((question) => question.unread > 0)
          .map((question) => ({
            personKey: person.personKey,
            name: person.nickname || person.name,
            sessionId: session.sessionId,
            sessionQuestionId: question.sessionQuestionId,
            question: question.text,
            unread: question.unread,
            lastActivity: question.lastActivity,
          })),
      ),
    );
    items.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
    return {
      items,
      total: items.reduce((sum, item) => sum + item.unread, 0),
    };
  });

/**
 * Everyone the person has any tie to, whatever the origin: a remote block, an
 * in-person room, or someone they added during a group session.
 *
 * One round trip: people_overview() does the identity matching, per-session
 * aggregation and unread counting inside Postgres. Each PostgREST call costs
 * 150–600ms of network, so the old loop of ~12 sequential queries took seconds.
 */
export const listPeople = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(identity).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linkProfileToGuestRows } = await import("@/lib/identity.server");
    const { loadDetail, metLabel } = await import("@/lib/relationships.server");

    // Stamps profile ids onto old guest rows; the overview matches either key,
    // so it doesn't need to wait for the write.
    const linking = linkProfileToGuestRows(supabaseAdmin as never, {
      guestToken: data.guestToken,
      profileId: data.profileId,
    });

    type OverviewRow = {
      personKey: string;
      name: string;
      nickname: string;
      contact: string;
      note: string;
      metKind: string;
      sessionCount: number;
      unread: number;
      lastActivity: string;
    };

    const [overviewResult, detail] = await Promise.all([
      (supabaseAdmin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: { people?: OverviewRow[] } | null;
          error: { message: string } | null;
        }>;
      }).rpc("people_overview", {
        _guest_token: data.guestToken,
        _profile_id: data.profileId ?? null,
      }),
      loadDetail(supabaseAdmin as never, data.guestToken, data.profileId),
    ]);
    await linking;
    const { data: overview, error } = overviewResult;
    if (error) throw new Error(error.message);

    const questionIds = [
      ...new Set(
        detail.people.flatMap((person) =>
          person.sessions.flatMap((session) => session.questions.map((question) => question.questionId)),
        ),
      ),
    ];
    const questionResult = questionIds.length
      ? await supabaseAdmin
          .from("questions")
          .select("id, pack, question_type")
          .in("id", questionIds)
      : { data: [] };
    const { data: packRows } = await supabaseAdmin
      .from("pack_config")
      .select("pack, unlock_threshold, display_order")
      .order("display_order");

    const questionMeta = new Map(
      (questionResult.data ?? []).map((row) => [
        row.id,
        { pack: row.pack, type: row.question_type },
      ]),
    );
    const packs = (packRows ?? []) as {
      pack: string;
      unlock_threshold: number;
      display_order: number;
    }[];
    const details = new Map(detail.people.map((person) => [person.personKey, person]));

    function statusFor(personKey: string, name: string, unread: number) {
      const person = details.get(personKey);
      if (!person) return "Start your first round";
      const questions = person.sessions.flatMap((session) => session.questions);
      const wrongWithReason = questions.filter(
        (question) =>
          question.revealed &&
          question.matched === false &&
          question.unread > 0 &&
          question.theirReason,
      ).length;
      if (wrongWithReason > 0) return `Guessed you wrong on ${wrongWithReason} — see why`;
      if (unread > 0) return unread === 1 ? "One new reply" : `${unread} new replies`;

      const answeredByPack = new Map<string, Set<string>>();
      for (const question of questions) {
        const info = questionMeta.get(question.questionId);
        if (
          !question.revealed ||
          !question.myLabel ||
          !question.theirLabel ||
          !info?.pack ||
          (info.type !== "ab" && info.type !== "ab_reason")
        )
          continue;
        const ids = answeredByPack.get(info.pack) ?? new Set<string>();
        ids.add(question.sessionQuestionId);
        answeredByPack.set(info.pack, ids);
      }
      const unlocked = [...packs]
        .reverse()
        .find((pack) => (answeredByPack.get(pack.pack)?.size ?? 0) >= pack.unlock_threshold);
      if (unlocked) {
        const labels: Record<string, string> = {
          click: "Click",
          talk: "Talk",
          bring_out: "Bring out",
          clash: "Clash",
        };
        return `${labels[unlocked.pack] ?? unlocked.pack} unlocked`;
      }

      const waiting = questions.filter(
        (question) => !question.revealed && question.myLabel && !question.theirLabel,
      ).length;
      if (waiting > 0) return `Waiting on ${name} · ${waiting} ${waiting === 1 ? "question" : "questions"}`;
      return "Start another round";
    }

    return {
      people: (overview?.people ?? []).map((row) => ({
        personKey: row.personKey,
        name: row.name,
        nickname: row.nickname,
        contact: row.contact,
        note: row.note,
        sessionCount: row.sessionCount,
        unread: row.unread,
        lastActivity: row.lastActivity,
        status: statusFor(row.personKey, row.nickname || row.name, row.unread),
        met: metLabel(row.metKind),
        sessionsLabel:
          row.sessionCount === 0
            ? "No sessions together yet"
            : row.sessionCount === 1
              ? "1 session together"
              : `${row.sessionCount} sessions together`,
      })),
    };
  });

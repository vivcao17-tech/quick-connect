import { QUESTION_SELECT, snapshotRow } from "@/lib/irl-helpers";
import type { QuestionRow } from "@/lib/irl-helpers";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** A host who toggled "I'm playing too" off: runs the room, never appears in results. */
export const OBSERVER_ROLE = "host_observer";
export const HOST_HANDOFF_SECONDS = 60;

export async function groupMember(admin: Admin, sessionId: string, guestToken: string) {
  const { data: participant } = await admin
    .from("session_participants")
    .select("id, display_name, role")
    .eq("session_id", sessionId)
    .eq("guest_token", guestToken)
    .maybeSingle();
  if (!participant) throw new Error("Not in this room");
  return participant;
}

export function isHostRole(role: string) {
  return role === "host" || role === OBSERVER_ROLE;
}

/** A spread of ordinary A/B questions — group mode has no topic step. */
export async function pickGroupQuestions(admin: Admin, count: number) {
  const { data: rows } = await admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .eq("question_type", "standard")
    .lte("spice_level", 2);

  const pool = ((rows as QuestionRow[] | null) ?? []).filter(Boolean);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  // Spread across topics first so eight questions don't all come from one word.
  const seen = new Set<string>();
  const spread: QuestionRow[] = [];
  const rest: QuestionRow[] = [];
  for (const q of pool) {
    const key = q.topic_id ?? "none";
    if (seen.has(key)) rest.push(q);
    else {
      seen.add(key);
      spread.push(q);
    }
  }
  return [...spread, ...rest].slice(0, count);
}

export function questionSnapshot(q: QuestionRow) {
  return snapshotRow(q);
}

/**
 * A request that the current host ignored for a full minute transfers on its own.
 * Resolved here (on read) so no background job is needed.
 */
export async function settleHostRequest(admin: Admin, sessionId: string) {
  const { data: request } = await admin
    .from("host_requests")
    .select("id, requester_participant_id, created_at")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request) return null;

  const ageMs = Date.now() - new Date(request.created_at).getTime();
  if (ageMs < HOST_HANDOFF_SECONDS * 1000) {
    return {
      id: request.id,
      requesterParticipantId: request.requester_participant_id,
      secondsLeft: Math.max(0, Math.ceil(HOST_HANDOFF_SECONDS - ageMs / 1000)),
    };
  }

  await transferHost(admin, sessionId, request.requester_participant_id);
  await admin
    .from("host_requests")
    .update({ status: "granted", resolved_at: new Date().toISOString() })
    .eq("id", request.id);
  return null;
}

export async function transferHost(admin: Admin, sessionId: string, toParticipantId: string) {
  const { data: people } = await admin
    .from("session_participants")
    .select("id, role")
    .eq("session_id", sessionId);

  for (const person of people ?? []) {
    if (person.id === toParticipantId) {
      if (person.role !== "host") await admin.from("session_participants").update({ role: "host" }).eq("id", person.id);
    } else if (isHostRole(person.role)) {
      await admin.from("session_participants").update({ role: "member" }).eq("id", person.id);
    }
  }
}

/** "Tim's the only one." — plain fact, never a request to explain. */
export function minorityLine(names: string[]) {
  if (names.length === 1) return `${names[0]}'s the only one.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are the only two.`;
  return "";
}

export function askLine(names: string[]) {
  if (names.length === 1) return `Ask ${names[0]}.`;
  if (names.length === 2) return `Ask ${names[0]} and ${names[1]}.`;
  return "";
}

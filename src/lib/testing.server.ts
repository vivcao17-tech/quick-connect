/**
 * Which rooms should never count as real usage.
 *
 * Test status is never guessed from names, emails that look fake, or digits.
 * It comes from two places only: an explicit flagged-identity list (accounts by
 * email, signed-in profiles, and guest devices), and automation — anything
 * driven by a headless browser during verification. Both resolve to
 * `sessions.is_test = true` at creation time, and a database trigger keeps it
 * true whenever a flagged person joins a room later.
 */

import { getRequestHeader } from "@tanstack/react-start/server";

type Admin = { from: (table: string) => any; rpc: (...args: any[]) => any };

export type CreatorIdentity = { guestToken?: string | null; profileId?: string | null };

/** Headless Chrome / Playwright / bots — every verification run I drive. */
function isAutomatedRequest(): boolean {
  try {
    const ua = (getRequestHeader("user-agent") ?? "").toLowerCase();
    if (!ua) return false;
    return /headless|playwright|puppeteer|bot|spider|curl\//.test(ua);
  } catch {
    return false;
  }
}

/** True when this person is on the flagged list (token, profile, or account email). */
export async function isExcludedIdentity(
  admin: Admin,
  identity: CreatorIdentity,
): Promise<boolean> {
  if (!identity.guestToken && !identity.profileId) return false;
  const { data } = await admin.rpc("identity_is_test", {
    _profile_id: identity.profileId ?? null,
    _guest_token: identity.guestToken ?? null,
  });
  return Boolean(data);
}

/** The `is_test` value to stamp on a brand-new room. */
export async function resolveIsTest(admin: Admin, identity: CreatorIdentity): Promise<boolean> {
  if (isAutomatedRequest()) return true;
  return isExcludedIdentity(admin, identity);
}

export type TestIdentity = {
  id: string;
  kind: "guest_token" | "profile" | "email";
  value: string;
  note: string | null;
  createdAt: string;
  label: string | null;
};

/** Everyone currently flagged as test, newest first, with a readable label. */
export async function readTestIdentities(admin: Admin): Promise<TestIdentity[]> {
  const { data } = await admin
    .from("excluded_identities")
    .select("id, kind, value, note, created_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as {
    id: string;
    kind: TestIdentity["kind"];
    value: string;
    note: string | null;
    created_at: string;
  }[];

  const profileIds = rows.filter((row) => row.kind === "profile").map((row) => row.value);
  const names = new Map<string, string>();
  if (profileIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", profileIds);
    for (const p of (profiles ?? []) as {
      id: string;
      display_name: string | null;
      email: string | null;
    }[])
      names.set(p.id, p.display_name || p.email || "");
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    value: row.value,
    note: row.note,
    createdAt: row.created_at,
    label: row.kind === "profile" ? (names.get(row.value) ?? null) : null,
  }));
}

/** Flag an account by email, a signed-in profile, or one guest device. */
export async function addTestIdentity(
  admin: Admin,
  kind: TestIdentity["kind"],
  value: string,
  note: string | null,
) {
  const clean = value.trim();
  if (!clean) throw new Error("Nothing to flag");
  const { error } = await admin
    .from("excluded_identities")
    .insert({ kind, value: kind === "email" ? clean.toLowerCase() : clean, note });
  // A duplicate is not a failure — the person is already flagged.
  if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);

  if (kind === "email") await applyEmailFlagToPastRooms(admin, clean.toLowerCase());
  return { ok: true };
}

export async function removeTestIdentity(admin: Admin, id: string) {
  const { error } = await admin.from("excluded_identities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Newly flagged account: catch up its existing rooms too. */
async function applyEmailFlagToPastRooms(admin: Admin, email: string) {
  const { data: profiles } = await admin.from("profiles").select("id").ilike("email", email);
  const ids = ((profiles ?? []) as { id: string }[]).map((row) => row.id);
  if (!ids.length) return;
  const { data: parts } = await admin
    .from("session_participants")
    .select("session_id")
    .in("profile_id", ids);
  const sessionIds = [
    ...new Set(((parts ?? []) as { session_id: string }[]).map((r) => r.session_id)),
  ];
  if (sessionIds.length)
    await admin.from("sessions").update({ is_test: true }).in("id", sessionIds);
}

/**
 * Mark a room as test (or not) and, when marking, flag everyone in it — this is
 * what makes rooms started from the dashboard self-labelling, guests included.
 */
export async function setSessionTest(
  admin: Admin,
  sessionId: string,
  isTest: boolean,
  flagPeople: boolean,
) {
  const { error } = await admin.from("sessions").update({ is_test: isTest }).eq("id", sessionId);
  if (error) throw new Error(error.message);

  if (isTest && flagPeople) {
    const { data: parts } = await admin
      .from("session_participants")
      .select("profile_id, guest_token")
      .eq("session_id", sessionId);
    const rows: { kind: string; value: string; note: string }[] = [];
    for (const p of (parts ?? []) as { profile_id: string | null; guest_token: string | null }[]) {
      if (p.guest_token)
        rows.push({ kind: "guest_token", value: p.guest_token, note: "test room" });
      if (p.profile_id) rows.push({ kind: "profile", value: p.profile_id, note: "test room" });
    }
    for (const row of rows) await admin.from("excluded_identities").insert(row);
  }

  return { sessionId, isTest };
}

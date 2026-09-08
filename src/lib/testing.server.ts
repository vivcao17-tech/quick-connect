/**
 * Which rooms should never count as real usage.
 *
 * Two sources: an explicit excluded-identities list (the owner's account and
 * devices), and automation — anything driven by a headless browser during
 * verification. Both resolve to `sessions.is_test = true` at creation time, so
 * nobody has to spot a scripted run on the dashboard afterwards.
 */

type Admin = { from: (table: string) => any };

export type CreatorIdentity = { guestToken?: string | null; profileId?: string | null };

/** Headless Chrome / Playwright / bots — every verification run I drive. */
function isAutomatedRequest(): boolean {
  try {
    // Imported lazily so this module stays usable outside a request context.
    const { getRequestHeader } = require("@tanstack/react-start/server") as {
      getRequestHeader: (name: string) => string | undefined;
    };
    const ua = (getRequestHeader("user-agent") ?? "").toLowerCase();
    if (!ua) return false;
    return /headless|playwright|puppeteer|bot|spider|curl\//.test(ua);
  } catch {
    return false;
  }
}

/** True when this person's rooms are excluded from the numbers. */
export async function isExcludedIdentity(
  admin: Admin,
  identity: CreatorIdentity,
): Promise<boolean> {
  const pairs: [string, string][] = [];
  if (identity.guestToken) pairs.push(["guest_token", identity.guestToken]);
  if (identity.profileId) pairs.push(["profile", identity.profileId]);
  if (pairs.length === 0) return false;

  const found = await Promise.all(
    pairs.map(async ([kind, value]) => {
      const { data } = await admin
        .from("excluded_identities")
        .select("id")
        .eq("kind", kind)
        .eq("value", value)
        .maybeSingle();
      return Boolean(data);
    }),
  );
  return found.some(Boolean);
}

/** The `is_test` value to stamp on a brand-new room. */
export async function resolveIsTest(admin: Admin, identity: CreatorIdentity): Promise<boolean> {
  if (isAutomatedRequest()) return true;
  return isExcludedIdentity(admin, identity);
}

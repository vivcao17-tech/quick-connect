/**
 * Who the caller is, server-side.
 *
 * A person is two keys at once: the browser guest token they started with, and
 * (once they sign in) their profile id. Every "my rows" lookup must match
 * either one, otherwise signing in or switching device makes their own history
 * unreachable even though the rows are still sitting in the database.
 */

type Admin = { from: (table: string) => any };

export type Identity = { guestToken: string; profileId?: string | undefined };

export type ParticipantRow = {
  id: string;
  session_id: string;
  role: string;
  display_name: string | null;
  profile_id: string | null;
  guest_token: string | null;
};

const COLUMNS = "id, session_id, role, display_name, profile_id, guest_token";

/** Every participant row belonging to this person, under either key. */
export async function myParticipants(admin: Admin, identity: Identity): Promise<ParticipantRow[]> {
  const keys: { column: string; value: string }[] = [];
  if (identity.guestToken) keys.push({ column: "guest_token", value: identity.guestToken });
  if (identity.profileId) keys.push({ column: "profile_id", value: identity.profileId });
  if (keys.length === 0) return [];

  const found = await Promise.all(
    keys.map(async (key) => {
      const { data } = await admin
        .from("session_participants")
        .select(COLUMNS)
        .eq(key.column, key.value);
      return (data ?? []) as ParticipantRow[];
    }),
  );
  return [...new Map(found.flat().map((row) => [row.id, row])).values()];
}

/**
 * My participant row in one session, or null. Throwing is left to the caller so
 * each handler can phrase its own refusal.
 */
export async function myParticipantIn(
  admin: Admin,
  sessionId: string,
  identity: Identity,
): Promise<ParticipantRow | null> {
  const rows = await myParticipants(admin, identity);
  return rows.find((row) => row.session_id === sessionId) ?? null;
}

/**
 * Once someone signs in, stamp their profile id onto the guest rows they made
 * before signing in. Cheap, idempotent, and it is what lets a sent history
 * follow them onto a second device.
 */
export async function linkProfileToGuestRows(admin: Admin, identity: Identity): Promise<void> {
  if (!identity.profileId || !identity.guestToken) return;
  await admin
    .from("session_participants")
    .update({ profile_id: identity.profileId })
    .eq("guest_token", identity.guestToken)
    .is("profile_id", null);
}

/**
 * Contact details (phone numbers, emails saved in private notes) need a real
 * sign-in once the guest token belongs to a claimed account. A guest token
 * alone still reads and replies; it just can't see those. People who never
 * signed up keep full access — they have no account to sign in to.
 * `profileId` here is already verified by the verifyProfileId middleware.
 */
export async function contactsLocked(admin: Admin, identity: Identity): Promise<boolean> {
  if (identity.profileId || !identity.guestToken) return false;
  const { data } = await admin
    .from("session_participants")
    .select("id")
    .eq("guest_token", identity.guestToken)
    .not("profile_id", "is", null)
    .limit(1);
  return (data ?? []).length > 0;
}

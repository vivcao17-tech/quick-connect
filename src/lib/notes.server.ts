/**
 * Private annotations one person keeps about another.
 *
 * Notes are owned by the reader, never by the person they describe, so they
 * live in their own table keyed by (owner_key, target_key) — both are person
 * keys (profile id when signed in, guest token otherwise). Nothing here is ever
 * shown to the person being described.
 */

type Admin = { from: (table: string) => any };

export type PersonNote = { nickname: string; contact: string; note: string };

export const EMPTY_NOTE: PersonNote = { nickname: "", contact: "", note: "" };

/** Keys the reader may own notes under: their guest token and their profile id. */
export function ownerKeys(identity: { guestToken: string; profileId?: string | undefined }) {
  return [identity.guestToken, identity.profileId].filter(Boolean) as string[];
}

/** The key new notes are written under — profile first, so they survive devices. */
export function writeKey(identity: { guestToken: string; profileId?: string | undefined }) {
  return identity.profileId || identity.guestToken;
}

/** Every note this reader holds, by target person key. */
export async function loadNotes(
  admin: Admin,
  identity: { guestToken: string; profileId?: string | undefined },
): Promise<Map<string, PersonNote>> {
  const keys = ownerKeys(identity);
  const out = new Map<string, PersonNote>();
  if (keys.length === 0) return out;

  const { data } = await admin
    .from("person_notes")
    .select("owner_key, target_key, nickname, contact, note, updated_at")
    .in("owner_key", keys)
    .order("updated_at");

  for (const row of (data ?? []) as {
    target_key: string;
    nickname: string | null;
    contact: string | null;
    note: string | null;
  }[]) {
    out.set(row.target_key, {
      nickname: row.nickname ?? "",
      contact: row.contact ?? "",
      note: row.note ?? "",
    });
  }
  return out;
}

export async function loadNote(
  admin: Admin,
  identity: { guestToken: string; profileId?: string | undefined },
  targetKey: string,
): Promise<PersonNote> {
  const notes = await loadNotes(admin, identity);
  return notes.get(targetKey) ?? EMPTY_NOTE;
}

export async function saveNote(
  admin: Admin,
  identity: { guestToken: string; profileId?: string | undefined },
  targetKey: string,
  patch: PersonNote,
): Promise<PersonNote> {
  const owner = writeKey(identity);
  if (!owner) return EMPTY_NOTE;

  const value = {
    nickname: patch.nickname.trim() || null,
    contact: patch.contact.trim() || null,
    note: patch.note.trim() || null,
  };

  // Notes written before sign-in live under the guest token; move them across
  // so the reader keeps one row per person instead of two.
  for (const key of ownerKeys(identity)) {
    if (key === owner) continue;
    await admin.from("person_notes").delete().eq("owner_key", key).eq("target_key", targetKey);
  }

  await admin
    .from("person_notes")
    .upsert(
      { owner_key: owner, target_key: targetKey, ...value, updated_at: new Date().toISOString() },
      { onConflict: "owner_key,target_key" },
    );

  return {
    nickname: value.nickname ?? "",
    contact: value.contact ?? "",
    note: value.note ?? "",
  };
}

/** The name the reader should see: their own alias wins over the real one. */
export function displayName(notes: Map<string, PersonNote>, key: string, fallback: string) {
  return notes.get(key)?.nickname || fallback;
}

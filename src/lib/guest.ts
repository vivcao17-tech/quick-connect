const KEY = "beside.guest_token";

let memoryToken = "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // version 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant
  const hex = Array.from(b, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Always a real UUID. Every server function validates this value with
 * z.string().uuid(), so a fallback that returns anything else silently locks
 * the person out of their own history.
 */
function randomToken(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
    }
  } catch {
    // fall through to Math.random
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return uuidFromBytes(bytes);
}

/**
 * Stable per-browser guest identity. Never throws: private mode, blocked storage
 * and older browsers fall back to an in-memory token so joining still works.
 */
export function getGuestToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(KEY);
    // Tokens written by older builds were not always UUID-shaped; replace them.
    if (stored && UUID_RE.test(stored)) return stored;
    const token = memoryToken || randomToken();
    memoryToken = token;
    window.localStorage.setItem(KEY, token);
    return token;
  } catch {
    if (!memoryToken) memoryToken = randomToken();
    return memoryToken;
  }
}

/** True when this browser refuses to persist the identity (private mode, iframe). */
export function guestTokenIsEphemeral(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(`${KEY}.probe`, "1");
    window.localStorage.removeItem(`${KEY}.probe`);
    return false;
  } catch {
    return true;
  }
}

/** Restores a known identity — used when someone opens a saved session link. */
export function setGuestToken(token: string): void {
  if (typeof window === "undefined" || !UUID_RE.test(token)) return;
  memoryToken = token;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // memory-only identity is still better than none
  }
}

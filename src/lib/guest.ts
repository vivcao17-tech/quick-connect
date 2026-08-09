const KEY = "beside.guest_token";

let memoryToken = "";

function randomToken(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through to Math.random
  }
  return `g-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Stable per-browser guest identity. Never throws: private mode, blocked storage
 * and older browsers fall back to an in-memory token so joining still works.
 */
export function getGuestToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) return stored;
    const token = memoryToken || randomToken();
    memoryToken = token;
    window.localStorage.setItem(KEY, token);
    return token;
  } catch {
    if (!memoryToken) memoryToken = randomToken();
    return memoryToken;
  }
}

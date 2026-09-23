import { createMiddleware } from "@tanstack/react-start";

/**
 * Many server functions take `profileId` from the browser alongside the guest
 * token. Nothing used to check it, so anyone could pass someone else's profile
 * id and be treated as them. This global middleware runs before every server
 * function: if the input carries a profileId that doesn't match a valid
 * sign-in token on the request, the profileId is dropped and the call carries
 * on as guest-token-only. No sign-in wall — an expired session just falls back
 * to the device's guest identity.
 */
const verified = new Map<string, { sub: string; exp: number }>();

async function verifiedUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (token.split(".").length !== 3) return null;
  const now = Date.now() / 1000;
  const cached = verified.get(token);
  if (cached && cached.exp > now) return cached.sub;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  const claimedExp = data?.claims?.exp;
  const exp = typeof claimedExp === "number" ? claimedExp : now + 60;
  if (verified.size > 500) verified.clear();
  verified.set(token, { sub, exp });
  return sub;
}

export const verifyProfileId = createMiddleware({ type: "function" }).server(
  async ({ next, data }) => {
    const input = data as unknown;
    if (input && typeof input === "object" && !Array.isArray(input)) {
      const record = input as Record<string, unknown>;
      if (typeof record["profileId"] === "string" && record["profileId"]) {
        const { getRequest } = await import("@tanstack/react-start/server");
        const sub = await verifiedUserId(getRequest()?.headers.get("authorization") ?? null);
        if (sub !== record["profileId"]) delete record["profileId"];
      }
    }
    return next();
  },
);

import { createHmac, timingSafeEqual } from "crypto";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const SITE_URL = "https://nosure.app";
export const FROM = "NoSure <hello@nosure.app>";

/** Signed so an unsubscribe link can't be forged for someone else's address. */
export function unsubscribeToken(email: string): string {
  const secret = process.env["EMAIL_UNSUBSCRIBE_SECRET"] ?? "";
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubscribeTokenValid(email: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(token ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email: string): string {
  const address = email.trim().toLowerCase();
  return `${SITE_URL}/api/public/unsubscribe?e=${encodeURIComponent(address)}&t=${unsubscribeToken(address)}`;
}

export async function isOptedOut(admin: Admin, email: string): Promise<boolean> {
  const { data } = await admin
    .from("email_optouts")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return Boolean(data);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "Amy replied about <question>." — who and which question, never the words
 * they wrote. The message itself lives behind the link.
 */
export async function sendReplyEmail(
  admin: Admin,
  opts: { to: string; actorName: string; questionText: string; link: string },
): Promise<{ sent: boolean; reason?: string; id?: string | undefined }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false, reason: "no_api_key" };

  const to = opts.to.trim().toLowerCase();
  if (await isOptedOut(admin, to)) return { sent: false, reason: "opted_out" };

  const deepLink = `${SITE_URL}${opts.link}`;
  const optOut = unsubscribeUrl(to);
  const subject = `${opts.actorName} replied`;
  const html = `
    <div style="font-family:Georgia,serif;color:#221c17;padding:24px;max-width:520px">
      <p style="letter-spacing:.24em;text-transform:uppercase;font-size:12px;color:#8a8079">no/sure</p>
      <p style="font-size:22px;line-height:1.35;margin:24px 0 8px">
        ${escapeHtml(opts.actorName)} replied.
      </p>
      <p style="font-size:16px;color:#6f665f;margin:0 0 24px">
        ${escapeHtml(opts.questionText)}
      </p>
      <p><a href="${deepLink}" style="background:#221c17;color:#fbf7f1;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:16px">Read it</a></p>
      <p style="font-size:12px;color:#8a8079;margin-top:32px">
        <a href="${optOut}" style="color:#8a8079">Unsubscribe from reply emails</a>
      </p>
    </div>`;
  const text = `${opts.actorName} replied.\n${opts.questionText}\n\n${deepLink}\n\nUnsubscribe: ${optOut}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`[email] resend failed [${response.status}]: ${body}`);
    return { sent: false, reason: `resend_${response.status}` };
  }
  let id: string | undefined;
  try {
    id = (JSON.parse(body) as { id?: string }).id;
  } catch {
    id = undefined;
  }
  return { sent: true, id };
}

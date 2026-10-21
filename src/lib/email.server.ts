import { createHmac, timingSafeEqual } from "crypto";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const SITE_URL = "https://guess.nosure.app";
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

/** Delivery outcomes land in `events` so the dashboard can surface silent failures. */
async function logDelivery(
  admin: Admin,
  kind: string,
  outcome: { sent: boolean; reason?: string; id?: string | undefined },
) {
  try {
    await admin.from("events").insert({
      name: outcome.sent ? "email_sent" : "email_failed",
      props: {
        kind,
        status: outcome.sent ? "sent" : (outcome.reason ?? "unknown"),
        id: outcome.id ?? null,
      },
    } as never);
  } catch {
    // never let analytics break a send
  }
  return outcome;
}

/**
 * "Amy replied about <question>." — who and which question, never the words
 * they wrote. The message itself lives behind the link.
 */
export async function sendReplyEmail(
  admin: Admin,
  opts: { to: string; actorName: string; questionText: string; link: string },
): Promise<{ sent: boolean; reason?: string; id?: string | undefined }> {
  const KIND = "reply";
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return logDelivery(admin, KIND, { sent: false, reason: "no_api_key" });

  const to = opts.to.trim().toLowerCase();
  if (await isOptedOut(admin, to))
    return logDelivery(admin, KIND, { sent: false, reason: "opted_out" });

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
    return logDelivery(admin, "reply", { sent: false, reason: `resend_${response.status}` });
  }
  let id: string | undefined;
  try {
    id = (JSON.parse(body) as { id?: string }).id;
  } catch {
    id = undefined;
  }
  return logDelivery(admin, KIND, { sent: true, id });
}

/**
 * Sent the moment someone saves a session with their email. The whole point is
 * the link: it's their way back into this exact conversation, no account needed.
 */
export async function sendSessionSavedEmail(
  admin: Admin,
  opts: {
    to: string;
    withName: string;
    isGroup: boolean;
    questionCount: number;
    path: string;
  },
): Promise<{ sent: boolean; reason?: string; id?: string | undefined }> {
  const KIND = "session_saved";
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return logDelivery(admin, KIND, { sent: false, reason: "no_api_key" });

  const to = opts.to.trim().toLowerCase();
  if (await isOptedOut(admin, to))
    return logDelivery(admin, KIND, { sent: false, reason: "opted_out" });

  const deepLink = `${SITE_URL}${opts.path}`;
  const optOut = unsubscribeUrl(to);
  const count = opts.questionCount;
  const questions = `${count} question${count === 1 ? "" : "s"}`;
  const headline = opts.isGroup
    ? `${opts.withName} — ${questions}`
    : `You and ${opts.withName} — ${questions}`;
  const second = opts.isGroup
    ? "Everyone's answers are in there, and anyone you added. Here's your way back in."
    : "They said one thing you didn't expect. Here's your way back in.";
  const subject = headline;

  const html = `
    <div style="font-family:Georgia,serif;color:#221c17;padding:24px;max-width:520px">
      <p style="letter-spacing:.24em;text-transform:uppercase;font-size:12px;color:#8a8079">no/sure</p>
      <p style="font-size:24px;line-height:1.35;margin:24px 0 8px">${escapeHtml(headline)}</p>
      <p style="font-size:16px;color:#6f665f;margin:0 0 24px">${escapeHtml(second)}</p>
      <p><a href="${deepLink}" style="background:#221c17;color:#fbf7f1;padding:12px 26px;border-radius:999px;text-decoration:none;font-size:16px">Open</a></p>
      <p style="font-size:14px;color:#8a8079;margin-top:24px">
        Keep this email. The link opens the questions, both sides' answers and the thread — no sign-in.
      </p>
      <p style="font-size:12px;color:#8a8079;margin-top:32px">
        <a href="${optOut}" style="color:#8a8079">Unsubscribe</a>
      </p>
    </div>`;
  const text = `${headline}\n${second}\n\n${deepLink}\n\nKeep this email — the link opens the questions, both sides' answers and the thread, no sign-in.\n\nUnsubscribe: ${optOut}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`[email] session-saved resend failed [${response.status}]: ${body}`);
    return logDelivery(admin, "session_saved", {
      sent: false,
      reason: `resend_${response.status}`,
    });
  }
  let id: string | undefined;
  try {
    id = (JSON.parse(body) as { id?: string }).id;
  } catch {
    id = undefined;
  }
  return logDelivery(admin, KIND, { sent: true, id });
}

import { FROM } from "@/lib/email.server";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Swap these keys to change which five questions a card uses. */
export const STARTER_QUESTION_KEYS = [
  "know_wrong",
  "know_better_at",
  "know_privately",
  "know_plans",
  "know_host",
] as const;

/** Friends can see which guesses were right immediately. */
export const REQUIRE_AUTH_FOR_GUESS_RESULT = false;

export type KnowQuestion = {
  id: string;
  key: string;
  selfText: string;
  otherText: string;
  optionA: string;
  optionB: string;
};

export async function loadKnowQuestions(admin: Admin): Promise<KnowQuestion[]> {
  const { data, error } = await admin
    .from("questions")
    .select("id, question_key, text, stem_self, stem_other, option_a, option_b")
    .in("question_key", [...STARTER_QUESTION_KEYS]);
  if (error) throw error;
  const rows = new Map((data ?? []).map((row) => [row.question_key as string, row]));
  return STARTER_QUESTION_KEYS.map((key) => {
    const row = rows.get(key);
    if (!row) throw new Error(`Missing question ${key}`);
    return {
      id: row.id,
      key,
      selfText: row.stem_self ?? row.text,
      otherText: row.stem_other ?? row.text,
      optionA: row.option_a,
      optionB: row.option_b,
    };
  });
}

/** The subject's own five answers — server-side only, never sent before guessing. */
export async function subjectAnswers(admin: Admin, participantId: string) {
  const { data } = await admin
    .from("answers")
    .select("question_id, option_key, created_at")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true });
  return new Map((data ?? []).map((row) => [row.question_id, row.option_key as string]));
}

/** New self-answers are revisions; the original session answers remain untouched. */
export async function latestSelfAnswers(admin: Admin, cardId: string, participantId: string, questions: KnowQuestion[]) {
  const original = await subjectAnswers(admin, participantId);
  const { data, error } = await admin.from("impression_self_revisions")
    .select("question_key, option_key, created_at, id")
    .eq("card_id", cardId).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  const byKey = new Map(questions.map(q => [q.key, q.id]));
  for (const row of data ?? []) {
    const id = byKey.get(row.question_key);
    if (id) original.set(id, row.option_key);
  }
  return original;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "your friend";
}

export async function sendGuessEmail(admin: Admin, to: string, guesser: string, score: number) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return;
  const { isOptedOut, unsubscribeUrl } = await import("@/lib/email.server");
  const address = to.trim().toLowerCase();
  if (await isOptedOut(admin, address)) return;
  const line = `${guesser} guessed. They got ${score}/5.`;
  const link = "https://guess.nosure.app/me/impressions";
  const optOut = unsubscribeUrl(address);
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: FROM,
        to: [address],
        subject: line,
        text: `${line}\n\n${link}\n\nUnsubscribe: ${optOut}`,
        html: `<div style="font-family:Georgia,serif;color:#221c17;padding:24px;max-width:520px"><p style="letter-spacing:.24em;text-transform:uppercase;font-size:12px;color:#8a8079">no/sure</p><p style="font-size:22px;margin:24px 0">${esc(line)}</p><p><a href="${link}" style="background:#221c17;color:#fbf7f1;padding:12px 22px;border-radius:999px;text-decoration:none">See how people read you</a></p><p style="font-size:12px;margin-top:32px"><a href="${optOut}" style="color:#8a8079">Unsubscribe</a></p></div>`,
      }),
    });
  } catch {
    // email is a bonus; the in-app badge still shows
  }
}

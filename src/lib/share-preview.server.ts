import type { Snapshot } from "@/lib/remote-shared";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type QuestionPreview = {
  senderName: string;
  recipientName: string;
  prompt: string;
  options: [string, string];
};

export type WallPreview = { name: string };

export function firstName(value: string | null | undefined, fallback: string) {
  return value?.trim().split(/\s+/)[0] || fallback;
}

function namedPrompt(prompt: string, recipientName: string) {
  return prompt.replace(/\{name\}/gi, recipientName).replace(/\s+,/g, ",");
}

export async function invitePreview(admin: Admin, token: string): Promise<QuestionPreview | null> {
  const { data: invite } = await admin
    .from("invites")
    .select("session_id, recipient_label, inviter_participant_id")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return null;

  const [{ data: inviter }, { data: questions }] = await Promise.all([
    admin
      .from("session_participants")
      .select("display_name")
      .eq("id", invite.inviter_participant_id ?? "")
      .maybeSingle(),
    admin
      .from("session_questions")
      .select("order_index, snapshot")
      .eq("session_id", invite.session_id)
      .order("order_index"),
  ]);

  const snapshots = (questions ?? [])
    .map((row) => row.snapshot as Snapshot | null)
    .filter((snapshot): snapshot is Snapshot => Boolean(snapshot));
  const question = snapshots.find((snapshot) => snapshot.kind === "impression") ?? snapshots[0];
  const optionA = question?.options[0]?.label;
  const optionB = question?.options[1]?.label;
  if (!question || !optionA || !optionB) return null;

  const recipientName = firstName(invite.recipient_label, "you");
  return {
    senderName: firstName(inviter?.display_name, "A friend"),
    recipientName,
    prompt: namedPrompt(question.stemOther || question.text, recipientName),
    options: [optionA, optionB],
  };
}

export async function chainPreview(admin: Admin, token: string): Promise<QuestionPreview | null> {
  const { data: guess } = await admin
    .from("chain_guesses")
    .select("guesser_name, subject_name, week_id")
    .eq("token", token)
    .maybeSingle();
  if (!guess) return null;

  const { data: week } = await admin
    .from("chain_weeks")
    .select("chain_questions(text, option_a, option_b)")
    .eq("id", guess.week_id)
    .maybeSingle();
  const question = week?.chain_questions as
    | { text: string; option_a: string; option_b: string }
    | null
    | undefined;
  if (!question) return null;

  const recipientName = firstName(guess.subject_name, "you");
  return {
    senderName: firstName(guess.guesser_name, "A friend"),
    recipientName,
    prompt: namedPrompt(question.text, recipientName),
    options: [question.option_a, question.option_b],
  };
}

export async function wallPreview(admin: Admin, handle: string): Promise<WallPreview | null> {
  const { data: profileId } = await admin.rpc("profile_id_for_handle", {
    _handle: handle.toLowerCase(),
  });
  if (!profileId) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;
  return { name: firstName(profile.display_name, "Their") };
}
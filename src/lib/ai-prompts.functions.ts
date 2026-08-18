import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type RevealPrompts = {
  source: "ai" | "template";
  observation: string;
  prompts: string[];
};

const schema = z.object({
  guestToken: z.string().uuid(),
  sessionQuestionId: z.string().uuid(),
});

const SYSTEM = [
  "You are a friend sitting with two people who just compared answers to a question.",
  "You noticed something small and interesting. You are casual, short, a little amused.",
  "Never use assessment language: no compatible, complementary, personality, type, score, match.",
  "Never judge the relationship and never say who is right.",
  "If they picked the same option, the interesting thing is usually how their reasons differ.",
  "If reasons are missing, ask for the story, not the logic.",
  'Reply with strict JSON only: {"observation": string, "prompts": [string, string, string]}.',
  "observation: one sentence, max 20 words, never a summary of what they picked.",
  "prompts: exactly 2 questions, each under 12 words, second person, directly askable to the other person.",
].join(" ");

/**
 * Generates the reveal-screen discussion prompts once per session_question and caches
 * them on the row. Returns template source on any failure so the caller can fall back.
 */
export const getRevealPrompts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<RevealPrompts> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fallback: RevealPrompts = { source: "template", observation: "", prompts: [] };

    const { data: sq } = await supabaseAdmin
      .from("session_questions")
      .select("id, session_id, question_id, revealed_at, snapshot, ai_prompts")
      .eq("id", data.sessionQuestionId)
      .maybeSingle();
    if (!sq || !sq.revealed_at) return fallback;

    const { data: me } = await supabaseAdmin
      .from("session_participants")
      .select("id")
      .eq("session_id", sq.session_id)
      .eq("guest_token", data.guestToken)
      .maybeSingle();
    if (!me) return fallback;

    const cached = sq.ai_prompts as RevealPrompts | null;
    if (cached && Array.isArray(cached.prompts) && cached.prompts.length > 0) {
      return { source: "ai", observation: cached.observation ?? "", prompts: cached.prompts };
    }

    const snap = sq.snapshot as { text: string; options: { key: string; label: string }[] } | null;
    if (!snap) return fallback;

    const { data: people } = await supabaseAdmin
      .from("session_participants")
      .select("id, display_name")
      .eq("session_id", sq.session_id);

    const { data: answers } = await supabaseAdmin
      .from("answers")
      .select("participant_id, option_key, reason_text, created_at")
      .eq("session_question_id", sq.id)
      .order("created_at");

    const latest = new Map<string, { option_key: string; reason_text: string | null }>();
    for (const row of answers ?? []) latest.set(row.participant_id, row);

    const lines = (people ?? []).map((p) => {
      const a = latest.get(p.id);
      const label = snap.options.find((o) => o.key === a?.option_key)?.label ?? "no answer";
      const reason = a?.reason_text?.trim();
      return `${p.display_name ?? "Someone"} chose "${label}"${reason ? ` because: ${reason}` : " (no reason given)"}`;
    });

    // Two fallbacks that still name this question's actual options, so the
    // continuation prompts are never generic filler.
    const chosen = [...latest.values()].map((a) => a.option_key);
    const labelOf = (k: string | undefined) =>
      snap.options.find((o) => o.key === k)?.label ?? "";
    const first = labelOf(chosen[0]);
    const second = labelOf(chosen.find((k) => k !== chosen[0]));
    const templates: RevealPrompts =
      second && first
        ? {
            source: "template",
            observation: "",
            prompts: [`Why "${first}" and not "${second}"?`, `What would make you switch?`],
          }
        : first
          ? {
              source: "template",
              observation: "",
              prompts: [`What made you both say "${first}"?`, `Was it always "${first}"?`],
            }
          : fallback;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return templates;

    const started = Date.now();
    let succeeded = false;
    let result: RevealPrompts = templates;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: [
                `Question: ${snap.text}`,
                `Options: ${snap.options.map((o) => o.label).join(" / ")}`,
                ...lines,
              ].join("\n"),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = payload.choices?.[0]?.message?.content ?? "";
        const json = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as {
          observation?: unknown;
          prompts?: unknown;
        };
        const prompts = Array.isArray(json.prompts)
          ? json.prompts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 2)
          : [];
        if (prompts.length > 0) {
          result = {
            source: "ai",
            observation: typeof json.observation === "string" ? json.observation : "",
            prompts,
          };
          succeeded = true;
          await supabaseAdmin
            .from("session_questions")
            .update({ ai_prompts: result as never })
            .eq("id", sq.id);
        }
      }
    } catch {
      succeeded = false;
    }

    await supabaseAdmin.from("events").insert({
      guest_token: data.guestToken,
      session_id: sq.session_id,
      name: "ai_prompt_generated",
      props: { question_id: sq.question_id, succeeded, latency_ms: Date.now() - started },
    });

    return result;
  });

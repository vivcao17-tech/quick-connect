import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { createElement } from "react";

const size = { width: 1200, height: 630 };

type Card =
  | { kind: "question"; heading: string; prompt: string; options: [string, string] }
  | { kind: "wall"; heading: string; prompt: string };

function textSize(text: string, normal: number, compact: number) {
  return text.length > 92 ? compact : normal;
}

function cardElement(card: Card) {
  const option = (label: string) =>
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          alignItems: "center",
          minHeight: 104,
          padding: "24px 30px",
          border: "2px solid #d8cfc1",
          borderRadius: 24,
          backgroundColor: "#fffdf9",
          color: "#2d2924",
          fontSize: textSize(label, 30, 25),
          lineHeight: 1.2,
        },
      },
      label,
    );

  return createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px 52px",
        backgroundColor: "#f7f1e8",
        color: "#2d2924",
        fontFamily: "sans-serif",
      },
    },
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", fontSize: 25, letterSpacing: 5 } },
      "NO",
      createElement("span", { style: { color: "#a64e2f" } }, "/"),
      "SURE",
    ),
    createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", maxWidth: 1040 } },
      createElement(
        "div",
        { style: { display: "flex", color: "#a64e2f", fontSize: 35, marginBottom: 24 } },
        card.heading,
      ),
      createElement(
        "div",
        {
          style: {
            display: "flex",
            fontFamily: "serif",
            fontSize: textSize(card.prompt, card.kind === "wall" ? 62 : 51, 42),
            lineHeight: 1.08,
          },
        },
        card.prompt,
      ),
      card.kind === "question"
        ? createElement(
            "div",
            { style: { display: "flex", gap: 22, marginTop: 34 } },
            option(card.options[0]),
            option(card.options[1]),
          )
        : createElement("div", {
            style: { display: "flex", width: 92, height: 8, marginTop: 34, backgroundColor: "#49a783" },
          }),
    ),
  );
}

function image(card: Card, status = 200) {
  return new ImageResponse(cardElement(card), {
    ...size,
    status,
    headers: {
      "Cache-Control": status === 200 ? "public, max-age=300, s-maxage=3600" : "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const Route = createFileRoute("/api/public/og/$kind/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { invitePreview, chainPreview, wallPreview } = await import(
          "@/lib/share-preview.server"
        );

        if (params.kind === "invite") {
          const preview = await invitePreview(supabaseAdmin, params.key);
          if (preview) {
            return image({
              kind: "question",
              heading: `${preview.senderName} has one question for you`,
              prompt: preview.prompt,
              options: preview.options,
            });
          }
        }
        if (params.kind === "chain") {
          const preview = await chainPreview(supabaseAdmin, params.key);
          if (preview) {
            return image({
              kind: "question",
              heading: `${preview.senderName} has one question for you`,
              prompt: preview.prompt,
              options: preview.options,
            });
          }
        }
        if (params.kind === "wall") {
          const preview = await wallPreview(supabaseAdmin, params.key);
          if (preview) {
            return image({
              kind: "wall",
              heading: `${preview.name}'s wall`,
              prompt: `See how people guess ${preview.name} — then guess them yourself.`,
            });
          }
        }

        return image(
          { kind: "wall", heading: "NoSure", prompt: "One question can change the conversation." },
          404,
        );
      },
    },
  },
});
import { createFileRoute } from "@tanstack/react-router";
import fontUrl from "@/assets/nosure-card.ttf?url";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";

type Card =
  | { kind: "question"; heading: string; prompt: string; options: [string, string] }
  | { kind: "wall"; heading: string; prompt: string };

let rendererReady: Promise<void> | null = null;

async function renderer() {
  const { initWasm, Resvg } = await import("@resvg/resvg-wasm");
  rendererReady ??= fetch(resvgWasmUrl)
    .then((response) => response.arrayBuffer())
    .then((wasm) => initWasm(wasm));
  await rendererReady;
  return Resvg;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });
}

function lines(value: string, max: number) {
  const words = value.trim().split(/\s+/);
  const result: string[] = [];
  for (const word of words) {
    const current = result[result.length - 1];
    if (!current || `${current} ${word}`.length > max) result.push(word);
    else result[result.length - 1] = `${current} ${word}`;
  }
  return result.slice(0, 4);
}

function textBlock(value: string, x: number, y: number, fontSize: number, max: number, color: string) {
  return lines(value, max)
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * fontSize * 1.13}" font-size="${fontSize}" fill="${color}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function svg(card: Card) {
  const promptSize = card.prompt.length > 92 ? 43 : 52;
  const promptMax = card.prompt.length > 92 ? 43 : 36;
  const promptLines = lines(card.prompt, promptMax).length;
  const promptY = card.kind === "question" ? 202 : 240;
  const optionsY = Math.min(470, promptY + promptLines * promptSize * 1.13 + 36);
  const options =
    card.kind === "question"
      ? `<rect x="64" y="${optionsY}" width="514" height="100" rx="20" fill="#fffdf9" stroke="#d8cfc1" stroke-width="2"/>
         <rect x="600" y="${optionsY}" width="536" height="100" rx="20" fill="#fffdf9" stroke="#d8cfc1" stroke-width="2"/>
         ${textBlock(card.options[0], 92, optionsY + 42, card.options[0].length > 37 ? 23 : 28, 35, "#2d2924")}
         ${textBlock(card.options[1], 628, optionsY + 42, card.options[1].length > 37 ? 23 : 28, 36, "#2d2924")}`
      : `<rect x="64" y="470" width="92" height="8" fill="#49a783"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f7f1e8"/>
    <g font-family="NoSure, sans-serif">
      <text x="64" y="76" font-size="25" letter-spacing="5" fill="#2d2924">NO<tspan fill="#a64e2f">/</tspan>SURE</text>
      <text x="64" y="148" font-size="35" fill="#a64e2f">${escapeXml(card.heading)}</text>
      ${textBlock(card.prompt, 64, promptY, card.kind === "wall" ? 60 : promptSize, card.kind === "wall" ? 32 : promptMax, "#2d2924")}
      ${options}
    </g>
  </svg>`;
}

async function image(card: Card, status = 200) {
  const [Resvg, font] = await Promise.all([
    renderer(),
    fetch(fontUrl).then((response) => response.arrayBuffer()),
  ]);
  const png = new Resvg(svg(card), {
    fitTo: { mode: "width", value: 1200 },
    font: { fontBuffers: [new Uint8Array(font)], defaultFontFamily: "NoSure" },
  })
    .render()
    .asPng();
  const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "image/png",
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
        const { invitePreview, chainPreview, wallPreview } =
          await import("@/lib/share-preview.server");

        if (params.kind === "invite") {
          const preview = await invitePreview(supabaseAdmin, params.key);
          if (preview)
            return image({
              kind: "question",
              heading: `${preview.senderName} has one question for you`,
              prompt: preview.prompt,
              options: preview.options,
            });
        }
        if (params.kind === "chain") {
          const preview = await chainPreview(supabaseAdmin, params.key);
          if (preview)
            return image({
              kind: "question",
              heading: `${preview.senderName} has one question for you`,
              prompt: preview.prompt,
              options: preview.options,
            });
        }
        if (params.kind === "wall") {
          const preview = await wallPreview(supabaseAdmin, params.key);
          if (preview)
            return image({
              kind: "wall",
              heading: `${preview.name}'s wall`,
              prompt: `See how people guess ${preview.name} — then guess them yourself.`,
            });
        }
        return image(
          { kind: "wall", heading: "NoSure", prompt: "One question can change the conversation." },
          404,
        );
      },
    },
  },
});
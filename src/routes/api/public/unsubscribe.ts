import { createFileRoute } from "@tanstack/react-router";

function page(message: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reply emails — NoSure</title></head>
     <body style="font-family:Georgia,serif;background:#fbf7f1;color:#221c17;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
       <main style="max-width:420px;padding:32px"><p style="letter-spacing:.24em;text-transform:uppercase;font-size:12px;color:#8a8079">no/sure</p>
       <p style="font-size:24px;line-height:1.35;margin-top:24px">${message}</p></main>
     </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

/** One-click unsubscribe from reply emails. Signed link, no account needed. */
export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
        const token = url.searchParams.get("t") ?? "";
        const { unsubscribeTokenValid } = await import("@/lib/email.server");
        if (!email || !unsubscribeTokenValid(email, token)) {
          return page("That link isn't valid any more.");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("email_optouts").upsert({ email }, { onConflict: "email" });
        return page("Done — no more reply emails to this address.");
      },
    },
  },
});

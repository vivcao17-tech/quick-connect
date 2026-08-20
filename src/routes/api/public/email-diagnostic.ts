import { createFileRoute } from "@tanstack/react-router";

/**
 * One-off diagnostic: sends a real email through Resend and reports the raw
 * result. Guarded by the same signed-token scheme as the unsubscribe link, so
 * it can't be triggered by anyone who doesn't already hold the server secret.
 */
export const Route = createFileRoute("/api/public/email-diagnostic")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const to = (url.searchParams.get("to") ?? "").trim().toLowerCase();
        const token = url.searchParams.get("t") ?? "";
        const { unsubscribeTokenValid, FROM } = await import("@/lib/email.server");

        if (!to || !unsubscribeTokenValid(`diag:${to}`, token)) {
          return Response.json({ error: "invalid_token" }, { status: 401 });
        }

        const apiKey = process.env["RESEND_API_KEY"];
        const base = {
          apiKeyPresent: Boolean(apiKey),
          apiKeyLength: apiKey ? apiKey.length : 0,
          from: FROM,
          to,
        };
        if (!apiKey) return Response.json({ ...base, error: "RESEND_API_KEY missing" }, { status: 500 });

        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: FROM,
              to: [to],
              subject: "NoSure email diagnostic",
              text: "This is a live test send from NoSure to verify Resend delivery.",
              html: "<p>This is a live test send from NoSure to verify Resend delivery.</p>",
            }),
          });
          const body = await response.text();
          let id: string | null = null;
          try {
            id = (JSON.parse(body) as { id?: string }).id ?? null;
          } catch {
            id = null;
          }
          return Response.json(
            { ...base, status: response.status, ok: response.ok, rawBody: body, messageId: id },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          return Response.json(
            { ...base, runtimeError: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});

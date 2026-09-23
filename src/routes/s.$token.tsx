import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { setGuestToken } from "@/lib/guest";
import { openSessionLink, previewSessionLinkFn, resendSessionLinkFn } from "@/lib/irl.functions";

export const Route = createFileRoute("/s/$token")({
  component: SavedLinkPage,
  head: () => ({
    meta: [
      { title: "Your way back in — NoSure" },
      {
        name: "description",
        content: "Opens the questions, both sides' answers and the thread from a saved session.",
      },
      { property: "og:title", content: "Your way back in — NoSure" },
      {
        property: "og:description",
        content: "The questions, the answers and the conversation after — right where you left it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Your way back in — NoSure" },
      { name: "twitter:description", content: "Right where you left it." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Preview = Awaited<ReturnType<typeof previewSessionLinkFn>>;

function SavedLinkPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const preview = useServerFn(previewSessionLinkFn);
  const open = useServerFn(openSessionLink);
  const resend = useServerFn(resendSessionLinkFn);
  const [state, setState] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  // Only looks — mail scanners that pre-open links must not use it up.
  useEffect(() => {
    let cancelled = false;
    void preview({ data: { token } })
      .then((result) => !cancelled && setState(result))
      .catch(() => !cancelled && setState({ status: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [preview, token]);

  async function continueIn() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await open({ data: { token } });
      if (!result.ok) return setState({ status: "expired" });
      if (result.guestToken) setGuestToken(result.guestToken);
      void navigate({ to: result.path, replace: true });
    } catch {
      setState({ status: "expired" });
    } finally {
      setBusy(false);
    }
  }

  async function sendFresh() {
    if (busy) return;
    setBusy(true);
    await resend({ data: { token } }).catch(() => null);
    setBusy(false);
    setResent(true);
  }

  const button =
    "rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground disabled:opacity-60";

  return (
    <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        {state === null && <p className="text-lg text-muted-foreground">One moment…</p>}

        {state?.status === "ready" && (
          <>
            <p className="text-lg">Back to your questions with {state.withName}.</p>
            <button type="button" className={button} disabled={busy} onClick={continueIn}>
              {busy ? "Opening…" : "Continue"}
            </button>
            <p className="text-sm text-muted-foreground">This link works once.</p>
          </>
        )}

        {(state?.status === "expired" || state?.status === "missing") && (
          <>
            <p className="text-lg">This link has already been used or has expired.</p>
            {resent ? (
              <p className="text-muted-foreground">
                If we have an email for this conversation, a fresh link is on its way there.
              </p>
            ) : (
              state.status === "expired" && (
                <button type="button" className={button} disabled={busy} onClick={sendFresh}>
                  Email me a fresh link
                </button>
              )
            )}
            <Link
              to="/auth"
              search={{ redirect: "/people" }}
              className="text-sm text-muted-foreground underline"
            >
              Have an account? Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

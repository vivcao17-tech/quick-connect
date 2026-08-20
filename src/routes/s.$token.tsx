import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { setGuestToken } from "@/lib/guest";
import { openSessionLink } from "@/lib/irl.functions";

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

function SavedLinkPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const open = useServerFn(openSessionLink);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void open({ data: { token } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setFailed(true);
        if (result.guestToken) setGuestToken(result.guestToken);
        void navigate({ to: result.path, replace: true });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, token, navigate]);

  return (
    <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
      <p className="text-lg text-muted-foreground">
        {failed ? "That link isn't good any more." : "One moment…"}
      </p>
    </main>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/j/$code")({
  component: ShortJoin,
  head: () => ({
    meta: [
      { title: "Join the room — NoSure" },
      {
        name: "description",
        content:
          "Open the room with a four-letter code. Three questions, thirty seconds, no signup.",
      },
      { property: "og:title", content: "Join the room — NoSure" },
      { property: "og:description", content: "Three questions, thirty seconds, no signup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Join the room — NoSure" },
      { name: "twitter:description", content: "Three questions, thirty seconds, no signup." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ShortJoin() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/join/$code",
      params: { code: code.toUpperCase() },
      replace: true,
    });
  }, [code, navigate]);

  return (
    <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
      <p className="text-lg text-muted-foreground">One moment…</p>
    </main>
  );
}

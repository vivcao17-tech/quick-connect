import { createFileRoute } from "@tanstack/react-router";

import { AsyncGroupRoom } from "@/components/AsyncGroupRoom";

export const Route = createFileRoute("/ga/$sessionId")({
  component: AsyncGroupPage,
  head: () => ({
    meta: [
      { title: "Your group's answers — NoSure" },
      {
        name: "description",
        content:
          "Everyone answers on their own time. When it opens, you see where each person landed and can talk about it.",
      },
      { property: "og:title", content: "Your group's answers — NoSure" },
      {
        property: "og:description",
        content: "Everyone answers on their own time, then you see where each person landed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Your group's answers — NoSure" },
      { name: "twitter:description", content: "Answer on your own time, then see the room." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AsyncGroupPage() {
  const { sessionId } = Route.useParams();
  return <AsyncGroupRoom sessionId={sessionId} />;
}

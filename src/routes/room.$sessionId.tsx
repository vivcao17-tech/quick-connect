import { createFileRoute } from "@tanstack/react-router";

import { Room } from "@/components/Room";

export const Route = createFileRoute("/room/$sessionId")({
  component: RoomPage,
  head: () => ({
    meta: [
      { title: "In the room — NoSure" },
      {
        name: "description",
        content: "Two phones, one table. Pick words, answer privately, reveal together, then talk.",
      },
      { property: "og:title", content: "In the room — NoSure" },
      {
        property: "og:description",
        content: "Two phones, one table. Answer privately, reveal together, then talk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "In the room — NoSure" },
      { name: "twitter:description", content: "Answer privately, reveal together, then talk." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function RoomPage() {
  const { sessionId } = Route.useParams();
  return <Room sessionId={sessionId} />;
}

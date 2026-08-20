import { createFileRoute } from "@tanstack/react-router";

import { GroupRoom } from "@/components/GroupRoom";

export const Route = createFileRoute("/g/$sessionId")({
  component: GroupPage,
  head: () => ({
    meta: [
      { title: "Group room — NoSure" },
      {
        name: "description",
        content: "Everyone answers on their own phone, then one screen shows where the room split.",
      },
      { property: "og:title", content: "Group room — NoSure" },
      {
        property: "og:description",
        content: "Everyone answers privately. Then you see who's the only one.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Group room — NoSure" },
      { name: "twitter:description", content: "Everyone answers privately, then you talk." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function GroupPage() {
  const { sessionId } = Route.useParams();
  return <GroupRoom sessionId={sessionId} />;
}

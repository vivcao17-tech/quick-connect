import { createFileRoute, redirect } from "@tanstack/react-router";

/** Per-question thread pages are gone; old links land on that question in the conversation. */
export const Route = createFileRoute("/with/$participantId/$sessionId")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" ? { q: search["q"] as string } : {},
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/with/$participantId",
      params: { participantId: params.participantId },
      search: search.q ? { q: search.q } : {},
      replace: true,
    });
  },
  head: () => ({
    meta: [{ title: "Conversation — NoSure" }, { name: "robots", content: "noindex" }],
  }),
});

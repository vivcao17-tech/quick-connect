import { createFileRoute } from "@tanstack/react-router";

import { AppTabs } from "@/components/AppTabs";

export const Route = createFileRoute("/meet")({
  component: MeetPage,
  head: () => ({
    meta: [
      { title: "Meet — NoSure" },
      { name: "description", content: "Meetups are coming to NoSure." },
      { property: "og:title", content: "Meet — NoSure" },
      { property: "og:description", content: "Meetups are coming to NoSure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function MeetPage() {
  return (
    <main className="paper min-h-screen bg-background pb-28">
      <section className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Meet</p>
          <h1 className="mt-5 text-4xl leading-tight">Meetups are coming. Check back soon.</h1>
        </div>
      </section>
      <AppTabs />
    </main>
  );
}

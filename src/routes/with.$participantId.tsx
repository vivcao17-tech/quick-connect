import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { Thread } from "@/components/Thread";
import { getPersonBlocks } from "@/lib/conversations.functions";
import { getGuestToken } from "@/lib/guest";
import { useRevealPrompts } from "@/lib/use-reveal-prompts";

export const Route = createFileRoute("/with/$participantId")({
  component: WithPersonPage,
  head: () => ({
    meta: [
      { title: "Everything you two answered — Beside" },
      {
        name: "description",
        content: "Every question you and this person have both answered, newest first.",
      },
      { property: "og:title", content: "Everything you two answered — Beside" },
      {
        property: "og:description",
        content: "Every question you two have both answered, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Everything you two answered — Beside" },
      {
        name: "twitter:description",
        content: "Every question you two have both answered, newest first.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof getPersonBlocks>>;
type Block = Data["blocks"][number];

function ago(iso: string) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

function WithPersonPage() {
  const { participantId } = Route.useParams();
  const [guestToken, setGuestToken] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useServerFn(getPersonBlocks);

  const refresh = useCallback(
    (token: string) =>
      void load({ data: { guestToken: token, personKey: participantId } })
        .then(setData)
        .catch(() => setData({ name: "", blocks: [] })),
    [load, participantId],
  );

  useEffect(() => {
    const token = getGuestToken();
    setGuestToken(token);
    if (token) refresh(token);
  }, [refresh]);

  const blocks = data?.blocks ?? [];
  const open = blocks.find((block) => block.sessionQuestionId === openId);
  const name = data?.name || "them";

  if (open) {
    return (
      <main className="paper min-h-screen bg-background">
        <section className="mx-auto min-h-screen max-w-xl px-6 py-10">
          <BlockView
            block={open}
            name={name}
            guestToken={guestToken}
            onBack={() => {
              setOpenId("");
              if (guestToken) refresh(guestToken);
            }}
          />
        </section>
      </main>
    );
  }

  const visible = showAll ? blocks : blocks.slice(0, 3);

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <Link
          to="/conversations"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          People
        </Link>
        <h1 className="mt-6 text-4xl leading-tight">You and {name}</h1>

        {data && blocks.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">Nothing between you yet.</p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          {visible.map((block) => (
            <button
              key={block.sessionQuestionId}
              onClick={() => setOpenId(block.sessionQuestionId)}
              className="card-soft px-6 py-5 text-left"
            >
              <p className="text-lg">{block.text}</p>
              <p className="mt-3 text-xl">
                {block.matched === null ? (
                  <span className="text-muted-foreground">Waiting for {name}</span>
                ) : block.matched ? (
                  "Same answer"
                ) : (
                  <span className="text-primary">Different answers</span>
                )}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {block.messageCount === 0
                  ? "Nothing said yet"
                  : `${block.messageCount} ${block.messageCount === 1 ? "line" : "lines"}`}
                {" · "}
                {ago(block.lastActivity)}
                {block.unread > 0 && <span className="text-primary"> · new</span>}
              </p>
            </button>
          ))}
        </div>

        {!showAll && blocks.length > 3 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-8 text-sm text-muted-foreground underline underline-offset-4"
          >
            See earlier
          </button>
        )}
      </section>
    </main>
  );
}

function BlockView({
  block,
  name,
  guestToken,
  onBack,
}: {
  block: Block;
  name: string;
  guestToken: string;
  onBack: () => void;
}) {
  const ai = useRevealPrompts(guestToken, block.sessionQuestionId, block.revealed);

  return (
    <div>
      {/* Question and both answers stay pinned while the thread scrolls. */}
      <div className="sticky top-0 z-20 border-b border-border bg-background pt-6 pb-6">
        <button onClick={onBack} className="text-sm text-muted-foreground underline underline-offset-4">
          Everything with {name}
        </button>
        <h2 className="mt-4 text-2xl leading-tight">{block.text}</h2>
        <p className="mt-4 text-base">
          <span className="text-muted-foreground">You: </span>
          {block.myLabel || "—"}
        </p>
        {block.myReason && (
          <p className="text-base italic text-muted-foreground">"{block.myReason}"</p>
        )}
        <p className="mt-2 text-base">
          <span className="text-muted-foreground">{name}: </span>
          <span className={block.matched === false ? "text-primary" : ""}>
            {block.revealed ? block.theirLabel || "—" : `Waiting for ${name}`}
          </span>
        </p>
        {block.theirReason && (
          <p className="text-base italic text-muted-foreground">"{block.theirReason}"</p>
        )}
      </div>

      {block.revealed ? (
        <>
          {ai.observation && <p className="mt-6 text-lg leading-snug">{ai.observation}</p>}
          <Thread
            guestToken={guestToken}
            sessionQuestionId={block.sessionQuestionId}
            prompts={ai.prompts}
          />
        </>
      ) : (
        <p className="mt-8 text-lg text-muted-foreground italic">Waiting for {name}.</p>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { Thread } from "@/components/Thread";
import { getSessionBlock } from "@/lib/conversations.functions";
import { useRevealPrompts } from "@/lib/use-reveal-prompts";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/with/$participantId/$sessionId")({
  component: SessionBlockPage,
  head: () => ({
    meta: [
      { title: "The three questions — NoSure" },
      {
        name: "description",
        content: "The three questions in this set, both answers, and what you said about them.",
      },
      { property: "og:title", content: "The three questions — NoSure" },
      {
        property: "og:description",
        content: "Both answers to each question in this set, and the conversation after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "The three questions — NoSure" },
      {
        name: "twitter:description",
        content: "Both answers to each question in this set, and the conversation after.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof getSessionBlock>>;
type Question = Data["questions"][number];

function SessionBlockPage() {
  const { participantId, sessionId } = Route.useParams();
  const viewer = useViewer();
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState("");

  const load = useServerFn(getSessionBlock);

  const refresh = useCallback(() => {
    if (!viewer.guestToken) return;
    void load({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
        personKey: participantId,
        sessionId,
      },
    })
      .then(setData)
      .catch(() => setData({ name: "", topic: "", questions: [] }));
  }, [load, participantId, sessionId, viewer.guestToken, viewer.profileId]);

  useEffect(() => {
    if (viewer.ready) refresh();
  }, [viewer.ready, refresh]);

  const questions = data?.questions ?? [];
  const name = data?.name || "them";
  const open = questions.find((q) => q.sessionQuestionId === openId);

  if (open) {
    return (
      <main className="paper min-h-screen bg-background">
        <section className="mx-auto min-h-screen max-w-xl px-6 py-10">
          <QuestionView
            question={open}
            name={name}
            guestToken={viewer.guestToken}
            onBack={() => {
              setOpenId("");
              refresh();
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <Link
          to="/with/$participantId"
          params={{ participantId }}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Everything with {name}
        </Link>
        <h1 className="mt-6 text-4xl leading-tight">{data?.topic || "Three questions"}</h1>

        <div className="mt-10 flex flex-col gap-3">
          {questions.map((question) => (
            <button
              key={question.sessionQuestionId}
              onClick={() => setOpenId(question.sessionQuestionId)}
              className="card-soft px-6 py-5 text-left"
            >
              <p className="text-lg">{question.text}</p>
              <p className="mt-3 text-xl">
                {question.matched === null ? (
                  <span className="text-muted-foreground">Waiting for {name}</span>
                ) : question.matched ? (
                  "Same answer"
                ) : (
                  <span className="text-primary">Different answers</span>
                )}
              </p>
              <p className="mt-2 text-base text-muted-foreground">
                You: {question.myLabel || "—"}
                {question.revealed && ` · ${name}: ${question.theirLabel || "—"}`}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {question.messageCount === 0
                  ? "Nothing said yet"
                  : `${question.messageCount} ${question.messageCount === 1 ? "line" : "lines"}`}
                {question.unread > 0 && <span className="text-primary"> · new</span>}
              </p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function QuestionView({
  question,
  name,
  guestToken,
  onBack,
}: {
  question: Question;
  name: string;
  guestToken: string;
  onBack: () => void;
}) {
  const ai = useRevealPrompts(guestToken, question.sessionQuestionId, question.revealed);

  return (
    <div>
      {/* Question and both answers stay pinned while the thread scrolls. */}
      <div className="sticky top-0 z-20 border-b border-border bg-background pt-6 pb-6">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to the three questions
        </button>
        <h2 className="mt-4 text-2xl leading-tight">{question.text}</h2>
        <p className="mt-4 text-base">
          <span className="text-muted-foreground">You: </span>
          {question.myLabel || "—"}
        </p>
        {question.myReason && (
          <p className="text-base italic text-muted-foreground">"{question.myReason}"</p>
        )}
        <p className="mt-2 text-base">
          <span className="text-muted-foreground">{name}: </span>
          <span className={question.matched === false ? "text-primary" : ""}>
            {question.revealed ? question.theirLabel || "—" : `Waiting for ${name}`}
          </span>
        </p>
        {question.theirReason && (
          <p className="text-base italic text-muted-foreground">"{question.theirReason}"</p>
        )}
      </div>

      {question.revealed ? (
        <>
          {ai.observation && <p className="mt-6 text-lg leading-snug">{ai.observation}</p>}
          <Thread
            guestToken={guestToken}
            sessionQuestionId={question.sessionQuestionId}
            prompts={ai.prompts}
          />
        </>
      ) : (
        <p className="mt-8 text-lg text-muted-foreground italic">Waiting for {name}.</p>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Thread } from "@/components/Thread";
import { getGuestToken } from "@/lib/guest";
import { getSenderResults } from "@/lib/remote.functions";

export const Route = createFileRoute("/sent/$sessionId")({
  component: SentPage,
  head: () => ({
    meta: [
      { title: "What came back — Beside" },
      {
        name: "description",
        content: "The answers that came back from the people you sent your three questions to.",
      },
      { property: "og:title", content: "What came back — Beside" },
      { property: "og:description", content: "The answers that came back." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "What came back — Beside" },
      { name: "twitter:description", content: "The answers that came back." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Results = Awaited<ReturnType<typeof getSenderResults>>;

function SentPage() {
  const { sessionId } = Route.useParams();
  const [guestToken, setGuestToken] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useServerFn(getSenderResults);

  useEffect(() => {
    const token = getGuestToken();
    setGuestToken(token);
    load({ data: { guestToken: token, sessionId } })
      .then(setResults)
      .catch(() => setError("These aren't your results."));
  }, [sessionId, load]);

  async function copy(token: string, note: string) {
    const message = `${note ? `${note}\n\n` : ""}3 questions · 30 seconds · no signup\n${window.location.origin}/i/${token}`;
    await navigator.clipboard.writeText(message);
    setCopied(token);
    window.setTimeout(() => setCopied(""), 2500);
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">What came back</h1>
        {error && <p className="mt-6 text-lg">{error}</p>}

        {results && results.headlines.length > 0 && (
          <div className="mt-8 flex flex-col gap-3">
            {results.headlines.map((line) => (
              <p key={line} className="text-2xl leading-snug">
                {line}
              </p>
            ))}
          </div>
        )}

        {results && (
          <div className="mt-12 flex flex-col gap-10">
            {results.recipients.map((recipient) => (
              <div key={recipient.token} className="card-soft px-6 py-6">
                <p className="text-2xl">{recipient.label}</p>

                {!recipient.answered && (
                  <div className="mt-4">
                    <p className="text-muted-foreground">
                      {recipient.stale ? "Send it to someone else?" : "Their link is out there."}
                    </p>
                    <button
                      onClick={() => copy(recipient.token, recipient.note)}
                      className="btn-quiet mt-4 hover:bg-secondary"
                    >
                      {copied === recipient.token ? "Copied" : "Copy message + link"}
                    </button>
                  </div>
                )}

                {recipient.answered && (
                  <div className="mt-6 flex flex-col gap-8">
                    {[...recipient.answers]
                      .sort((a, b) => Number(b.differs) - Number(a.differs))
                      .map((item) => {
                        const mine = results.questions.find((q) => q.index === item.index);
                        return (
                          <div key={`${recipient.token}-${item.index}`}>
                            <p className="text-lg">{item.text}</p>
                            <p className="mt-3 text-base">
                              <span className="text-muted-foreground">You: </span>
                              {mine?.options.find((o) => o.key === mine.myOption)?.label ?? "—"}
                            </p>
                            {mine?.myReason && (
                              <p className="text-base italic text-muted-foreground">
                                "{mine.myReason}"
                              </p>
                            )}
                            <p className="mt-2 text-base">
                              <span className="text-muted-foreground">{recipient.label}: </span>
                              <span className={item.differs ? "text-primary" : ""}>
                                {item.theirLabel || "—"}
                              </span>
                            </p>
                            {item.theirReason && (
                              <p className="text-base italic text-muted-foreground">
                                "{item.theirReason}"
                              </p>
                            )}
                            {item.sessionQuestionId && guestToken && (
                              <Thread
                                guestToken={guestToken}
                                sessionQuestionId={item.sessionQuestionId}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Link
          to="/remote"
          className="mt-12 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Ask something else
        </Link>
      </section>
    </main>
  );
}

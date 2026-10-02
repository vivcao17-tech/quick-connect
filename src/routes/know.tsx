import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Button } from "@/components/ui/button";
import { createKnowCard, getKnowStart } from "@/lib/know.functions";
import { logClientCardEvent } from "@/lib/card-events.functions";
import { readLocalViewer } from "@/lib/viewer";

export const Route = createFileRoute("/know")({
  component: KnowPage,
  head: () => ({
    meta: [
      { title: "How well do your friends know you? — NoSure" },
      { name: "description", content: "Answer five questions about yourself, then send a link and see who reads you right." },
      { property: "og:title", content: "How well do your friends know you? — NoSure" },
      { property: "og:description", content: "Five questions. Send the link. See who actually reads you right." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Q = { key: string; text: string; optionA: string; optionB: string };

function KnowPage() {
  const load = useServerFn(getKnowStart);
  const create = useServerFn(createKnowCard);
  const [viewer, setViewer] = useState<{ guestToken: string; profileId?: string } | null>(null);
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [answers, setAnswers] = useState<("a" | "b")[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(window.localStorage.getItem("beside.name") ?? "");
    void readLocalViewer().then(async (v) => {
      setViewer(v);
      try {
        const r = await load({ data: v });
        setQuestions(r.questions);
        setToken(r.existingToken);
      } catch {
        setError("Couldn't load the questions. Refresh to try again.");
      }
    });
  }, [load]);

  async function pick(option: "a" | "b") {
    if (!questions || !viewer || busy) return;
    const next = [...answers, option];
    setAnswers(next);
    if (next.length < questions.length) return;
    setBusy(true);
    try {
      const r = await create({
        data: { ...viewer, name: name.trim(), answers: questions.map((q, i) => ({ key: q.key, option: next[i]! })) },
      });
      setToken(r.token);
    } catch {
      setError("Couldn't save. Try again.");
      setAnswers(next.slice(0, -1));
    }
    setBusy(false);
  }

  const current = questions?.[answers.length];

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>
        {error && <p className="mt-6 text-sm text-primary">{error}</p>}

        {token ? (
          <ShareScreen token={token} signedIn={Boolean(viewer?.profileId)} viewer={viewer} />
        ) : !questions ? (
          <p className="mt-10 text-muted-foreground">One moment…</p>
        ) : !named ? (
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              window.localStorage.setItem("beside.name", name.trim());
              setNamed(true);
            }}
          >
            <h1 className="text-4xl leading-tight">See how your friends read you</h1>
            <p className="mt-3 text-muted-foreground">Answer five questions about yourself. Then send the link.</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              maxLength={40}
              className="mt-8 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
            />
            <Button type="submit" disabled={!name.trim()} className="mt-4 h-auto w-full rounded-full py-4 text-lg">
              Start
            </Button>
          </form>
        ) : current ? (
          <div className="mt-8">
            <p className="text-sm text-muted-foreground">{answers.length + 1} of {questions.length}</p>
            <h1 className="mt-3 text-4xl leading-tight">{current.text}…</h1>
            <div className="mt-8 flex flex-col gap-3">
              {(["a", "b"] as const).map((k) => (
                <button
                  key={k}
                  disabled={busy}
                  onClick={() => void pick(k)}
                  className="card-soft px-6 py-5 text-left text-xl hover:border-primary disabled:opacity-50"
                >
                  {k === "a" ? current.optionA : current.optionB}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-10 text-muted-foreground">Saving…</p>
        )}
      </section>
    </main>
  );
}

function ShareScreen({ token, signedIn, viewer }: { token: string; signedIn: boolean; viewer: { guestToken: string; profileId?: string } | null }) {
  const logEvent = useServerFn(logClientCardEvent);
  const logShare = (method: string) => void logEvent({ data: { event: "share_link_copied", token, guestToken: viewer?.guestToken, profileId: viewer?.profileId, meta: { method, page: "know" } } }).catch(() => undefined);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const url = `https://nosure.app/guess/${token}`;
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  return (
    <div className="mt-8">
      <h1 className="text-4xl leading-tight">Send this to 3 people who know you.</h1>
      <p className="mt-3 text-lg text-muted-foreground">See who actually reads you right.</p>
      <p className="card-soft mt-8 break-all px-5 py-4 text-base">{url}</p>
      <div className="mt-4 flex gap-3">
        <Button
          variant="outline"
          className="h-auto flex-1 rounded-full py-4"
          onClick={() => {
            logShare("copy");
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <Button
            className="h-auto flex-1 rounded-full py-4"
            onClick={() => { logShare("share"); void navigator.share({ title: "How well do you know me?", url }).catch(() => undefined); }}
          >
            Share
          </Button>
        )}
      </div>
      {signedIn ? (
        <Link to="/me/impressions" className="mt-10 inline-block text-sm underline underline-offset-4">
          See who's guessed
        </Link>
      ) : (
        <div className="mt-12">
          <p className="mb-3 text-sm text-muted-foreground">Save your account so you get told when someone guesses.</p>
          <GoogleSignIn redirectPath="/me/impressions" />
          <Link to="/auth" search={{ redirect: "/me/impressions" }} className="mt-3 block text-center text-sm underline underline-offset-4">
            Use email instead
          </Link>
        </div>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Button } from "@/components/ui/button";
import { getGuessCard, getGuessResult, submitGuesses } from "@/lib/know.functions";
import { logClientCardEvent } from "@/lib/card-events.functions";
import { readLocalViewer } from "@/lib/viewer";

export const Route = createFileRoute("/guess/$token")({
  loader: ({ params }) => getGuessCard({ data: { token: params.token } }),
  component: GuessPage,
  errorComponent: () => <Shell><p className="mt-10">Couldn't open this link. Refresh to try again.</p></Shell>,
  notFoundComponent: () => <Shell><p className="mt-10">This link doesn't work.</p></Shell>,
  head: ({ loaderData }) => {
    const title = loaderData ? `How well do you know ${loaderData.name}? — NoSure` : "How well do you know me? — NoSure";
    const desc = "Five guesses. See how many you get right.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>
        {children}
      </section>
    </main>
  );
}

type Row = { text: string; guessed: string; actual: string; right: boolean };

function GuessPage() {
  const card = Route.useLoaderData();
  const { token } = Route.useParams();
  const submit = useServerFn(submitGuesses);
  const result = useServerFn(getGuessResult);
  const logEvent = useServerFn(logClientCardEvent);
  const [ctaLogged, setCtaLogged] = useState(false);
  const [viewer, setViewer] = useState<{ guestToken: string; profileId?: string } | null>(null);
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [guesses, setGuesses] = useState<("a" | "b")[]>([]);
  const [score, setScore] = useState<{ score: number; total: number } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(window.localStorage.getItem("beside.name") ?? "");
    void readLocalViewer().then(async (v) => {
      setViewer(v);
      void logEvent({ data: { event: "guess_link_opened", token, ...v } }).catch(() => undefined);
      try {
        const r = await result({ data: { ...v, token } });
        if (r.status === "locked" || r.status === "done") setScore({ score: r.score, total: r.total });
        if (r.status === "done") setRows(r.rows);
      } catch {
        // nothing guessed yet
      }
    });
  }, [result, token, logEvent]);

  if (!card) return <Shell><p className="mt-10">This link doesn't work.</p></Shell>;

  async function pick(option: "a" | "b") {
    if (!card || !viewer || busy) return;
    const next = [...guesses, option];
    setGuesses(next);
    if (next.length < card.questions.length) return;
    setBusy(true);
    try {
      const r = await submit({
        data: { ...viewer, token, name: name.trim(), guesses: card.questions.map((q, i) => ({ key: q.key, option: next[i]! })) },
      });
      setScore({ score: r.score, total: r.total });
      setRows(r.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setGuesses(next.slice(0, -1));
    }
    setBusy(false);
  }

  const current = card.questions[guesses.length];

  if (score && rows) {
    if (!ctaLogged && viewer) {
      setCtaLogged(true);
      void logEvent({ data: { event: "own_card_cta_shown", token, ...viewer } }).catch(() => undefined);
    }
    return (
      <Shell>
        <h1 className="mt-8 text-5xl">{score.score}/{score.total}</h1>
        <div className="mt-8 flex flex-col gap-4">
          {rows.map((r) => (
            <div key={r.text} className="card-soft px-5 py-4">
              <p className="text-lg">{r.text.replace(/\{name\}/g, card.name)}…</p>
              <p className="mt-2 text-sm text-primary">{r.right ? "You got this one right" : "You got this one wrong"}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">You guessed</p>
                  <p className="mt-1 text-base">{r.guessed}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{card.name} said</p>
                  <p className="mt-1 text-base">{r.actual}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-8">
          <h2 className="text-2xl">Do your friends actually know you?</h2>
          <p className="mt-3 text-muted-foreground">Answer five questions. Send your link. See who reads you right.</p>
          <Button asChild className="mt-6 h-auto w-full rounded-full py-4 text-lg">
            <Link to="/auth" search={{ redirect: "/know" }} onClick={() => { if (viewer) void logEvent({ data: { event: "own_card_cta_clicked", token, ...viewer } }).catch(() => undefined); }}>Make your card</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (score) {
    return (
      <Shell>
        <h1 className="mt-8 text-4xl leading-tight">You got {score.score}/{score.total}. Sign in to see which ones.</h1>
        <div className="mt-8">
          <GoogleSignIn redirectPath={`/guess/${token}`} />
          <Link to="/auth" search={{ redirect: `/guess/${token}` }} className="mt-4 block text-center text-sm underline underline-offset-4">
            Use email instead
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-8 text-4xl leading-tight">How well do you know {card.name}?</h1>
      {error && <p className="mt-4 text-sm text-primary">{error}</p>}
      {!named ? (
        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            window.localStorage.setItem("beside.name", name.trim());
            setNamed(true);
            if (viewer) void logEvent({ data: { event: "guess_started", token, ...viewer } }).catch(() => undefined);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            maxLength={40}
            className="w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
          />
          <Button type="submit" disabled={!name.trim()} className="mt-4 h-auto w-full rounded-full py-4 text-lg">
            Start guessing
          </Button>
        </form>
      ) : current ? (
        <div className="mt-8">
          <p className="text-sm text-muted-foreground">{guesses.length + 1} of {card.questions.length}</p>
          <p className="mt-3 text-3xl leading-tight">{current.text}…</p>
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
        <p className="mt-10 text-muted-foreground">Checking…</p>
      )}
    </Shell>
  );
}

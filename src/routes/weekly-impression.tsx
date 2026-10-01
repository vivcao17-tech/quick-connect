import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createWeeklyImpression, getWeeklyImpression } from "@/lib/weekly.functions";
import { readLocalViewer } from "@/lib/viewer";

export const Route = createFileRoute("/weekly-impression")({
  component: WeeklyImpressionPage,
  head: () => ({ meta: [
    { title: "This week's question — NoSure" },
    { name: "description", content: "Answer this week's questions and send a link to friends." },
    { property: "og:title", content: "This week's question — NoSure" },
    { property: "og:description", content: "Answer this week's questions and send a link to friends." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Set = NonNullable<Awaited<ReturnType<typeof getWeeklyImpression>>>;

function WeeklyImpressionPage() {
  const get = useServerFn(getWeeklyImpression);
  const create = useServerFn(createWeeklyImpression);
  const [set, setSet] = useState<Set | null | undefined>(undefined);
  const [viewer, setViewer] = useState<{ guestToken: string; profileId?: string } | null>(null);
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<("a" | "b")[]>([]);
  const [third, setThird] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setName(localStorage.getItem("beside.name") ?? "");
    void readLocalViewer().then(async v => {
      setViewer(v);
      try { const result = await get({ data: v }); setSet(result); setToken(result?.token ?? null); }
      catch { setError("Couldn't load this week's questions."); setSet(null); }
    });
  }, [get]);

  async function submit(picks: ("a" | "b")[]) {
    if (!set || !viewer || !name.trim() || busy) return;
    setBusy(true);
    try {
      const selected = set.questions.slice(0, picks.length);
      const result = await create({ data: { ...viewer, name: name.trim(), answers: selected.map((q, i) => ({ key: q.key, option: picks[i] })) } });
      localStorage.setItem("beside.name", name.trim());
      setToken(result.token);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  const question = set?.questions[answers.length];
  const url = token ? `https://nosure.app/guess/${token}` : "";
  return <main className="paper min-h-screen bg-background"><section className="mx-auto max-w-xl px-6 py-16">
    <Link to="/me" className="text-sm text-muted-foreground underline">Back to You</Link>
    <h1 className="mt-8 text-4xl">This week's question</h1>
    {error && <p className="mt-5 text-sm text-primary" role="alert">{error}</p>}
    {set === undefined && <p className="mt-6 text-muted-foreground">One moment…</p>}
    {set === null && <p className="mt-6 text-muted-foreground">No questions are set for this week yet.</p>}
    {set && token && <div className="mt-8">
      <p className="text-lg">Send this link to a friend.</p>
      <p className="mt-4 break-all text-sm">{url}</p>
      <Button variant="outline" className="mt-5" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</Button>
    </div>}
    {set && !token && <div className="mt-7">
      <label className="block text-sm text-muted-foreground" htmlFor="weekly-name">Your first name</label>
      <input id="weekly-name" value={name} onChange={e => setName(e.target.value)} maxLength={40} className="mt-2 w-full border border-border bg-card px-4 py-3" />
      {question && (answers.length < 2 || third) ? <div className="mt-8">
        <p className="text-sm text-muted-foreground">{answers.length + 1} of {third ? 3 : 2}</p>
        <h2 className="mt-3 text-2xl">{question.text}…</h2>
        <div className="mt-5 grid gap-3">{(["a", "b"] as const).map(k => <Button key={k} variant="outline" disabled={!name.trim() || busy} className="h-auto justify-start whitespace-normal py-4 text-left" onClick={() => {
          const picks = [...answers, k]; setAnswers(picks);
          if (picks.length === (third ? 3 : 2)) void submit(picks);
        }}>{k === "a" ? question.optionA : question.optionB}</Button>)}</div>
      </div> : answers.length === 2 && !third && !busy ? <div className="mt-7">
        <Button onClick={() => void submit(answers)}>Send two questions</Button>
        <Button variant="outline" className="ml-3" onClick={() => setThird(true)}>Add a third</Button>
      </div> : <p className="mt-6 text-muted-foreground">Saving…</p>}
    </div>}
  </section></main>;
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { impressionStem, withName } from "@/components/QuestionText";
import { getGuestToken } from "@/lib/guest";
import {
  DEFAULT_PACK_LABEL,
  DEFAULT_PACK_TAGLINE,
  PACKS,
  PACK_LABEL,
  PACK_TAGLINE,
  roundsToUnlock,
  isPack,
} from "@/lib/packs";
import type { Pack } from "@/lib/packs";
import { getPairPackPicker, listPackCandidates } from "@/lib/packs.functions";
import { answerAsSender, createRemoteSession } from "@/lib/remote.functions";
import type { OptionKey, PlayQuestion } from "@/lib/remote-shared";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/remote")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { impression?: string; pack?: string; person?: string } => ({
    ...(typeof search["impression"] === "string" ? { impression: search["impression"] } : {}),
    ...(typeof search["pack"] === "string" ? { pack: search["pack"] } : {}),
    ...(typeof search["person"] === "string" ? { person: search["person"] } : {}),
  }),
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "Send three questions — NoSure" },
      {
        name: "description",
        content:
          "Answer three questions, then send them to the people you'd actually want to hear from. 30 seconds, no signup.",
      },
      { property: "og:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        property: "og:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "NoSure — 3 questions, 30 seconds" },
      {
        name: "twitter:description",
        content: "Answer three questions, then send them to someone. No signup.",
      },
    ],
  }),
});

type Candidate = {
  id: string;
  text: string;
  questionType: string;
  stemOther?: string | null;
  stemSelf?: string | null;
  options: { key: OptionKey; label: string }[];
};

function RemotePage() {
  const {
    impression: impressionQuestionId,
    pack: packParam,
    person: personKey,
  } = Route.useSearch();
  const viewer = useViewer();
  const [stage, setStage] = useState<"pack" | "pick" | "play">("pack");
  const [guestToken, setGuestToken] = useState("");
  const [name, setName] = useState("");
  const [packLabel, setPackLabel] = useState(DEFAULT_PACK_LABEL);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [impressions, setImpressions] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [chosenImpression, setChosenImpression] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<OptionKey | null>(null);
  const [tally, setTally] = useState<{ optionKey: OptionKey; votes: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<Awaited<ReturnType<typeof getPairPackPicker>> | null>(null);

  const navigate = useNavigate();
  const loadCandidates = useServerFn(listPackCandidates);
  const loadPicker = useServerFn(getPairPackPicker);
  const createSession = useServerFn(createRemoteSession);
  const answer = useServerFn(answerAsSender);

  useEffect(() => {
    setGuestToken(getGuestToken());
    setName(window.localStorage.getItem("beside.name") ?? "");
  }, []);

  useEffect(() => {
    if (!personKey || !guestToken) return;
    void loadPicker({
      data: {
        guestToken,
        personKey,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then(setPicker)
      .catch(() => setPicker(null));
  }, [guestToken, loadPicker, personKey, viewer.profileId]);

  const current = questions[index];

  async function choosePack(pack: Pack | null) {
    setBusy(true);
    setError("");
    try {
      const result = await loadCandidates({
        data: {
          ...(pack ? { pack } : {}),
          ...(guestToken ? { guestToken } : {}),
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          count: pack ? 4 : 6,
        },
      });
      setPackLabel(pack ? PACK_LABEL[pack] : DEFAULT_PACK_LABEL);
      setCandidates(result.questions as Candidate[]);
      setImpressions(result.impressions as Candidate[]);
      setChosen([]);
      setChosenImpression(result.impressions[0]?.id ?? "");
      setStage("pick");
    } catch {
      setError("That didn't load. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // A pack link from the shared page goes straight to its questions.
  useEffect(() => {
    if (stage !== "pack" || !isPack(packParam) || candidates.length > 0) return;
    void choosePack(packParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packParam, stage]);

  function toggle(id: string) {
    setChosen((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length >= 2
          ? prev
          : [...prev, id],
    );
  }

  async function begin() {
    if (chosen.length !== 2 || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      const displayName = name.trim() || "A friend";
      window.localStorage.setItem("beside.name", displayName);
      const impressionId = impressionQuestionId || chosenImpression;
      const questionIds = [
        ...candidates.filter((q) => chosen.includes(q.id)).map((q) => q.id),
        ...(impressionId ? [impressionId] : []),
      ];
      const result = await createSession({
        data: {
          guestToken,
          displayName,
          questionIds,
          ...(impressionId ? { impressionQuestionId: impressionId } : {}),
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
        },
      });
      setSessionId(result.sessionId);
      // A question they've already answered (the wall question they're re-asking)
      // isn't asked again.
      setQuestions(result.questions.filter((q) => !result.prefilled.includes(q.sessionQuestionId)));
      setIndex(0);
      setPicked(null);
      setTally(null);
      setStage("play");
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(optionKey: OptionKey, chipId?: string, chipText?: string) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    setPicked(optionKey);
    try {
      const text = chipText ?? reason.trim();
      const result = await answer({
        data: {
          guestToken,
          sessionQuestionId: current.sessionQuestionId,
          optionKey,
          ...(text ? { reasonText: text } : {}),
          ...(chipId ? { reasonChipId: chipId } : {}),
        },
      });
      setTally(result.tally);
    } catch {
      setPicked(null);
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setReason("");
    setPicked(null);
    setTally(null);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    void navigate({ to: "/send/$sessionId", params: { sessionId } });
  }

  const totals = useMemo(() => {
    if (!tally || !current) return null;
    const sum = tally.reduce((acc, row) => acc + row.votes, 0) || 1;
    const rows = current.options.map((option) => {
      const votes = tally.find((row) => row.optionKey === option.key)?.votes ?? 0;
      return { ...option, votes, share: Math.round((votes / sum) * 100) };
    });
    const top = [...rows].sort((a, b) => b.votes - a.votes)[0];
    return { rows, top };
  }, [tally, current]);

  const pickerPacks = useMemo(() => {
    if (!picker?.hasPlayed) return PACKS.map((pack) => ({ pack, next: false }));
    const next = picker.packs.find((pack) => !pack.unlocked)?.pack;
    return PACKS.map((pack) => ({ pack, next: pack === next })).sort((a, b) => {
      if (a.next) return -1;
      if (b.next) return 1;
      return PACKS.indexOf(a.pack) - PACKS.indexOf(b.pack);
    });
  }, [picker]);
  const anotherUnlocked =
    picker?.packs.some((item) => item.pack !== "clash" && item.unlocked) ?? false;

  return (
    <main className="paper min-h-screen bg-background">
      {stage === "pack" && (
        <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
          <h1 className="text-3xl">What do you want to find out?</h1>
          <p className="mt-2 max-w-md text-muted-foreground">Either of you can choose.</p>

          <div className="mt-10 flex flex-col gap-3">
            {(!personKey || picker?.hasPlayed === false) && (
              <button
                disabled={busy}
                onClick={() => void choosePack(null)}
                className="card-soft px-6 py-5 text-left hover:border-primary disabled:opacity-50"
              >
                <p className="text-xl">{DEFAULT_PACK_LABEL}</p>
                <p className="mt-1 text-base text-muted-foreground">{DEFAULT_PACK_TAGLINE}</p>
              </button>
            )}
            {pickerPacks.map(({ pack, next }) => (
              <button
                key={pack}
                disabled={busy}
                onClick={() => void choosePack(pack)}
                className="card-soft px-6 py-5 text-left hover:border-primary disabled:opacity-50"
              >
                {next && (
                  <p className="mb-1 text-xs tracking-[0.18em] text-primary uppercase">Next up</p>
                )}
                <p className="text-xl">{PACK_LABEL[pack]}</p>
                <p className="mt-1 text-base text-muted-foreground">{PACK_TAGLINE[pack]}</p>
                {picker?.hasPlayed &&
                  (() => {
                    const state = picker.packs.find((item) => item.pack === pack);
                    if (!state) return null;
                    const progress = roundsToUnlock(state, anotherUnlocked);
                    return progress ? (
                      <p className="mt-2 text-sm text-muted-foreground">{progress}</p>
                    ) : null;
                  })()}
              </button>
            ))}
          </div>

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "pick" && (
        <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
          <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">{packLabel}</p>
          <h1 className="mt-6 text-4xl leading-tight">Which ones do you want to ask?</h1>
          <p className="mt-2 text-muted-foreground">Pick two.</p>

          <div className="mt-8 flex flex-col gap-3">
            {candidates.map((q) => {
              const on = chosen.includes(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => toggle(q.id)}
                  className={`card-soft px-6 py-5 text-left text-lg ${on ? "border-primary" : "opacity-60"}`}
                >
                  {q.text}
                </button>
              );
            })}
          </div>

          {!impressionQuestionId && impressions.length > 1 && (
            <div className="mt-10">
              <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">
                And one read
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {impressions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setChosenImpression(q.id)}
                    className={`card-soft px-6 py-5 text-left text-lg ${
                      chosenImpression === q.id ? "border-primary" : "opacity-60"
                    }`}
                  >
                    {impressionStem(
                      {
                        text: q.text,
                        stemOther: q.stemOther ?? null,
                        stemSelf: q.stemSelf ?? null,
                      },
                      "other",
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mt-8 block text-sm text-muted-foreground">
            What should they see your name as?
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Amy"
              className="mt-2 w-full rounded-full border border-border bg-card px-5 py-3 text-base text-foreground outline-none focus:border-primary"
            />
          </label>
          <p className="mt-4 text-sm text-muted-foreground">
            By continuing you agree to our{" "}
            <Link to="/terms" className="underline underline-offset-4">
              terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>

          <button
            onClick={begin}
            disabled={busy || chosen.length !== 2}
            className="btn-ink mt-8 hover:opacity-90 disabled:opacity-40"
          >
            Answer them first
          </button>
          {error && <p className="mt-4 text-sm text-primary">{error}</p>}
        </section>
      )}

      {stage === "play" && current && (
        <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <p className="text-sm tracking-[0.24em] text-muted-foreground uppercase">{packLabel}</p>
          <h1 className="mt-6 text-4xl leading-tight">
            {current.kind === "impression"
              ? withName(impressionStem(current, "self"), "you")
              : current.text}
          </h1>

          {!tally && (
            <>
              <div className="mt-10 flex flex-col gap-3">
                {current.options.map((option) => (
                  <button
                    key={option.key}
                    disabled={busy}
                    onClick={() => choose(option.key)}
                    className="card-soft px-6 py-5 text-left text-lg hover:border-primary disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why? (one line, optional)"
                className="mt-6 w-full rounded-full border border-border bg-card px-5 py-3 text-base outline-none focus:border-primary"
              />
            </>
          )}

          {tally && totals && (
            <div className="mt-10">
              <p className="text-lg">
                {picked === totals.top?.key
                  ? "Here are your results — you're with most people."
                  : "Here are your results — you're in the minority."}
              </p>
              <div className="mt-6 flex flex-col gap-4">
                {totals.rows.map((row) => (
                  <div key={row.key}>
                    <div className="flex items-baseline justify-between text-base">
                      <span className={row.key === picked ? "text-primary" : ""}>{row.label}</span>
                      <span className="text-muted-foreground">{row.share}%</span>
                    </div>
                    <div className="mt-2 h-px w-full bg-border">
                      <div
                        className="h-px bg-primary"
                        style={{ width: `${Math.max(row.share, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={next} className="btn-quiet mt-12 hover:bg-secondary">
                {index + 1 < questions.length ? "Next" : "Send these to someone"}
              </button>
            </div>
          )}

          {error && <p className="mt-6 text-sm text-primary">{error}</p>}
        </section>
      )}
    </main>
  );
}

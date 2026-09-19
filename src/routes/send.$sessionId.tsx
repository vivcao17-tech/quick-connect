import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { createInvites, getAnswerSet, listSessionInvites } from "@/lib/remote.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/send/$sessionId")({
  component: SendPage,
  head: () => ({
    meta: [
      { title: "Send your three questions — NoSure" },
      {
        name: "description",
        content:
          "Make a private link for each person you want to ask. Copy it into your own messages — NoSure never sends anything itself.",
      },
      { property: "og:title", content: "Send your three questions — NoSure" },
      {
        property: "og:description",
        content: "One private link per person. Copy it into your own messages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Send your three questions — NoSure" },
      {
        name: "twitter:description",
        content: "One private link per person. Copy it into your own messages.",
      },
    ],
  }),
});

type OptionKey = "a" | "b" | "c";
type Recipient = { label: string; note: string; read: OptionKey | null };
type Invite = {
  token: string;
  label: string;
  note: string;
  answered?: boolean;
  opened?: boolean;
};
type AnswerSet = Awaited<ReturnType<typeof getAnswerSet>>;
type Answers = AnswerSet["questions"];
type Impression = AnswerSet["impression"];

/** "Chaotic than expected" reads as "Chaotic" in a column header. */
function shortLabel(label: string) {
  return label.split(/\s+than\s+/i)[0] ?? label;
}

function SendPage() {
  const { sessionId } = Route.useParams();
  const viewer = useViewer();
  const guestToken = viewer.guestToken;
  const [recipients, setRecipients] = useState<Recipient[]>([
    { label: "", note: "", read: null },
  ]);
  const [links, setLinks] = useState<Invite[]>([]);
  const [answers, setAnswers] = useState<Answers>([]);
  const [impression, setImpression] = useState<Impression>(null);
  const [senderName, setSenderName] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = useServerFn(createInvites);
  const loadExisting = useServerFn(listSessionInvites);
  const loadAnswers = useServerFn(getAnswerSet);

  // Links live in the database, not in this component's state — coming back to
  // this screen days later must show the same set and the same links.
  useEffect(() => {
    if (!viewer.ready || !guestToken) return;
    const payload = {
      guestToken,
      sessionId,
      ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
    };
    void loadExisting({ data: payload })
      .then((result) => setLinks(result.invites))
      .catch(() => undefined);
    void loadAnswers({ data: payload })
      .then((result) => {
        setAnswers(result.questions);
        setImpression(result.impression);
        setSenderName(result.senderName);
      })
      .catch(() => undefined);
  }, [loadExisting, loadAnswers, viewer.ready, viewer.profileId, guestToken, sessionId]);

  function update(i: number, patch: Partial<Recipient>) {
    setRecipients((prev) => prev.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  }

  const named = recipients.filter((r) => r.label.trim());
  const ready =
    named.length > 0 && (!impression || named.every((r) => r.read !== null));

  async function makeLinks() {
    if (!ready || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      const result = await send({
        data: {
          guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          sessionId,
          recipients: named.map((r) => ({
            label: r.label.trim(),
            note: r.note.trim(),
            ...(r.read ? { impression: r.read } : {}),
          })),
        },
      });
      setLinks((prev) => [...prev, ...result.invites]);
      setRecipients([{ label: "", note: "", read: null }]);
      const stored = JSON.parse(window.localStorage.getItem("beside.sent") ?? "[]");
      window.localStorage.setItem(
        "beside.sent",
        JSON.stringify([{ sessionId, at: Date.now() }, ...stored].slice(0, 20)),
      );
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(invite: Invite) {
    const origin = window.location.origin;
    // Addressed to one person, from one person — and the hook is the read on them.
    const from = senderName || "A friend";
    const to = invite.label.trim();
    const lines = [
      invite.note ? `${invite.note}\n` : "",
      `${to ? `${to} — ` : ""}${from} sent you three questions.`,
      impression
        ? `One of them is ${from}'s read on you.`
        : "One of them is about you.",
      "30 seconds, no signup.",
      `${origin}/i/${invite.token}`,
    ].filter(Boolean);
    const message = lines.join("\n");
    await navigator.clipboard.writeText(message);
    setCopied(invite.token);
    window.setTimeout(() => setCopied(""), 2500);
  }

  const columns = impression?.options ?? [];

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">Who do you want to send this to?</h1>
        <p className="mt-3 text-muted-foreground">
          Each person gets their own private link. They only ever see you and themselves.
        </p>

        {answers.length > 0 && (
          <div className="card-soft mt-8 px-6 py-5">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Your answers
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {/* The read is asked again per recipient below, so its templated
                  stem never appears here with an unfilled name. */}
              {answers
                .filter((question) => !question.text.includes("{name}"))
                .map((question) => (
                  <div key={question.sessionQuestionId}>
                    <p className="text-base text-muted-foreground">{question.text}</p>
                    <p className="text-lg">{question.myLabel}</p>
                    {question.myReason && (
                      <p className="mt-1 text-base italic text-muted-foreground">
                        "{question.myReason}"
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {impression ? (
          <div className="mt-10">
            <p className="text-lg text-muted-foreground">
              {impression.stemOther.replace(/\{name\}/g, "Each person below")}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-end gap-2 pl-1 text-sm text-muted-foreground">
                <span className="flex-1" />
                {columns.map((option) => (
                  <span key={option.key} className="w-20 text-center">
                    {shortLabel(option.label)}
                  </span>
                ))}
              </div>

              {recipients.map((recipient, i) => (
                <div key={i} className="card-soft px-4 py-3">
                  {recipient.label.trim() && (
                    <p className="mb-2 text-sm text-muted-foreground">
                      {impression.stemOther.replace(/\{name\}/g, recipient.label.trim())}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      value={recipient.label}
                      onChange={(event) => update(i, { label: event.target.value })}
                      placeholder="Their name"
                      className="min-w-0 flex-1 bg-transparent text-lg outline-none"
                    />
                    {columns.map((option) => {
                      const on = recipient.read === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-label={`${recipient.label || "This person"} — ${option.label}`}
                          onClick={() => update(i, { read: option.key })}
                          className={`flex w-20 justify-center py-2 ${
                            on ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`block h-5 w-5 rounded-full border ${
                              on ? "border-primary bg-primary" : "border-border"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={recipient.note}
                    onChange={(event) => update(i, { note: event.target.value })}
                    placeholder="Write them a line — just for them (optional)"
                    className="mt-2 w-full bg-transparent text-base italic outline-none placeholder:not-italic"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            {recipients.map((recipient, i) => (
              <div key={i} className="card-soft px-6 py-5">
                <input
                  value={recipient.label}
                  onChange={(event) => update(i, { label: event.target.value })}
                  placeholder="Their name"
                  className="w-full bg-transparent text-lg outline-none"
                />
                <textarea
                  value={recipient.note}
                  onChange={(event) => update(i, { note: event.target.value })}
                  rows={3}
                  placeholder="Write them a line — just for them"
                  className="mt-4 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-lg italic outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() =>
            setRecipients((prev) => [...prev, { label: "", note: "", read: null }])
          }
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
        >
          + Add someone
        </button>

        <div className="mt-10">
          <button
            onClick={makeLinks}
            disabled={busy || !ready}
            className="btn-ink hover:opacity-90 disabled:opacity-40"
          >
            Send to them
          </button>
          {impression && named.length > 0 && !ready && (
            <p className="mt-3 text-sm text-muted-foreground">
              Pick one side for each person first.
            </p>
          )}
        </div>
        {error && <p className="mt-4 text-sm text-primary">{error}</p>}

        {links.length > 0 && (
          <div className="mt-14 border-t border-border pt-10">
            <h2 className="text-3xl leading-tight">Yours to send.</h2>
            <p className="mt-3 text-lg text-primary">
              Each link is different — send each person their own.
            </p>
            <div className="mt-8 flex flex-col gap-5">
              {links.map((invite) => (
                <div key={invite.token} className="card-soft px-6 py-6">
                  <p className="font-display text-3xl leading-tight">{invite.label}</p>
                  <p className="mt-2 font-mono text-sm break-all text-muted-foreground">
                    /i/{invite.token}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {invite.answered ? "answered" : invite.opened ? "opened it" : "not sent yet"}
                  </p>
                  {invite.note && (
                    <p className="mt-2 text-base italic text-muted-foreground">"{invite.note}"</p>
                  )}
                  <button onClick={() => copy(invite)} className="btn-quiet mt-4 hover:bg-secondary">
                    {copied === invite.token ? "Copied" : `Copy ${invite.label}'s link`}
                  </button>
                </div>
              ))}
            </div>
            <Link
              to="/sent/$sessionId"
              params={{ sessionId }}
              className="mt-10 inline-block text-sm text-muted-foreground underline underline-offset-4"
            >
              See what comes back
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

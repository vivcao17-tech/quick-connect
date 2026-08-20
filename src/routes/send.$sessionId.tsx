import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { createInvites, listSessionInvites } from "@/lib/remote.functions";
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

type Recipient = { label: string; note: string };
type Invite = { token: string; label: string; note: string };

function SendPage() {
  const { sessionId } = Route.useParams();
  const viewer = useViewer();
  const guestToken = viewer.guestToken;
  const [recipients, setRecipients] = useState<Recipient[]>([{ label: "", note: "" }]);
  const [links, setLinks] = useState<Invite[]>([]);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = useServerFn(createInvites);
  const loadExisting = useServerFn(listSessionInvites);

  // Links live in the database, not in this component's state — a reload must
  // never lose a link that has already been handed out.
  useEffect(() => {
    if (!viewer.ready || !guestToken) return;
    void loadExisting({
      data: {
        guestToken,
        sessionId,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then((result) => setLinks(result.invites))
      .catch(() => undefined);
  }, [loadExisting, viewer.ready, viewer.profileId, guestToken, sessionId]);

  function update(i: number, patch: Partial<Recipient>) {
    setRecipients((prev) => prev.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  }

  async function makeLinks() {
    const clean = recipients.filter((r) => r.label.trim());
    if (clean.length === 0 || !guestToken) return;
    setBusy(true);
    setError("");
    try {
      const result = await send({
        data: {
          guestToken,
          sessionId,
          recipients: clean.map((r) => ({ label: r.label.trim(), note: r.note.trim() })),
        },
      });
      setLinks((prev) => [...prev, ...result.invites]);
      setRecipients([{ label: "", note: "" }]);
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
    const message = `${invite.note ? `${invite.note}\n\n` : ""}3 questions · 30 seconds · no signup\n${origin}/i/${invite.token}`;
    await navigator.clipboard.writeText(message);
    setCopied(invite.token);
    window.setTimeout(() => setCopied(""), 2500);
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">Who do you want to send this to?</h1>
        <p className="mt-3 text-muted-foreground">
          Each person gets their own private link. They only ever see you and themselves.
        </p>

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

        <button
          onClick={() => setRecipients((prev) => [...prev, { label: "", note: "" }])}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
        >
          Add someone else
        </button>

        <div className="mt-10">
          <button
            onClick={makeLinks}
            disabled={busy || !recipients.some((r) => r.label.trim())}
            className="btn-ink hover:opacity-90 disabled:opacity-40"
          >
            Make their links
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-primary">{error}</p>}

        {links.length > 0 && (
          <div className="mt-14 border-t border-border pt-10">
            <h2 className="text-3xl leading-tight">Yours to send.</h2>
            <p className="mt-3 text-muted-foreground">
              Copy each one into your own messages — nothing goes out from here.
            </p>
            <div className="mt-8 flex flex-col gap-4">
              {links.map((invite) => (
                <div key={invite.token} className="card-soft px-6 py-5">
                  <p className="text-lg">{invite.label}</p>
                  {invite.note && (
                    <p className="mt-2 text-base italic text-muted-foreground">"{invite.note}"</p>
                  )}
                  <button onClick={() => copy(invite)} className="btn-quiet mt-4 hover:bg-secondary">
                    {copied === invite.token ? "Copied" : "Copy message + link"}
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

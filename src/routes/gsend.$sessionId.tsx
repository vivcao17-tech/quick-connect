import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { getAsyncGroupHub, revealAsyncGroup } from "@/lib/async-group.functions";
import { getGuestToken } from "@/lib/guest";
import { createInvites } from "@/lib/remote.functions";

export const Route = createFileRoute("/gsend/$sessionId")({
  component: GroupSendPage,
  head: () => ({
    meta: [
      { title: "Send it to your group — NoSure" },
      {
        name: "description",
        content:
          "One private link per person, each with its own note. You can see who has answered, never what they picked.",
      },
      { property: "og:title", content: "Send it to your group — NoSure" },
      {
        property: "og:description",
        content: "One private link per person. You see who's answered, not what they said.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Send it to your group — NoSure" },
      { name: "twitter:description", content: "One private link per person." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Hub = Awaited<ReturnType<typeof getAsyncGroupHub>>;

function GroupSendPage() {
  const { sessionId } = Route.useParams();
  const load = useServerFn(getAsyncGroupHub);
  const send = useServerFn(createInvites);
  const reveal = useServerFn(revealAsyncGroup);

  const [guestToken, setGuestToken] = useState("");
  const [hub, setHub] = useState<Hub | null>(null);
  const [recipients, setRecipients] = useState([{ label: "", note: "" }]);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setGuestToken(getGuestToken()), []);

  const refresh = useCallback(async () => {
    if (!guestToken) return;
    try {
      setHub(await load({ data: { guestToken, sessionId } }));
    } catch {
      setError("This isn't your room.");
    }
  }, [load, guestToken, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function makeLinks() {
    const clean = recipients.filter((r) => r.label.trim());
    if (clean.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await send({
        data: {
          guestToken,
          sessionId,
          recipients: clean.map((r) => ({ label: r.label.trim(), note: r.note.trim() })),
        },
      });
      setRecipients([{ label: "", note: "" }]);
      await refresh();
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string, note: string) {
    const message = `${note ? `${note}\n\n` : ""}5 questions · everyone answers on their own time\n${window.location.origin}/gi/${token}`;
    await navigator.clipboard.writeText(message);
    setCopied(token);
    window.setTimeout(() => setCopied(""), 2500);
  }

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <h1 className="text-4xl leading-tight">Who's in this group?</h1>
        <p className="mt-3 text-muted-foreground">
          Everyone gets their own link and their own line from you. Only you can add people.
        </p>

        {hub && (
          <p className="mt-6 text-lg">
            {hub.answeredPeople} of {hub.totalPeople} have answered
            {hub.revealed ? " — it's open." : `. Opens on its own in ${hub.hoursLeft}h.`}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-6">
          {recipients.map((recipient, i) => (
            <div key={i} className="card-soft px-6 py-5">
              <input
                value={recipient.label}
                onChange={(event) =>
                  setRecipients((prev) =>
                    prev.map((item, j) =>
                      j === i ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Their name"
                className="w-full bg-transparent text-lg outline-none"
              />
              <textarea
                value={recipient.note}
                onChange={(event) =>
                  setRecipients((prev) =>
                    prev.map((item, j) => (j === i ? { ...item, note: event.target.value } : item)),
                  )
                }
                rows={2}
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

        <div className="mt-8">
          <button
            onClick={makeLinks}
            disabled={busy || !recipients.some((r) => r.label.trim())}
            className="btn-ink disabled:opacity-40"
          >
            Make their links
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-primary">{error}</p>}

        {hub && hub.invites.length > 0 && (
          <div className="mt-14 border-t border-border pt-10">
            <h2 className="text-3xl leading-tight">Yours to send.</h2>
            <div className="mt-8 flex flex-col gap-4">
              {hub.invites.map((invite) => (
                <div key={invite.token} className="card-soft px-6 py-5">
                  <p className="text-lg">
                    {invite.label}
                    <span className="ml-3 text-base text-muted-foreground">
                      {invite.answered ? "answered" : invite.opened ? "opened it" : "not yet"}
                    </span>
                  </p>
                  {invite.note && (
                    <p className="mt-2 text-base italic text-muted-foreground">"{invite.note}"</p>
                  )}
                  <button
                    onClick={() => void copy(invite.token, invite.note)}
                    className="btn-quiet mt-4 hover:bg-secondary"
                  >
                    {copied === invite.token ? "Copied" : "Copy message + link"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {hub && !hub.revealed && (
          <button
            onClick={() => {
              setBusy(true);
              void reveal({ data: { guestToken, sessionId } })
                .then(refresh)
                .finally(() => setBusy(false));
            }}
            disabled={busy}
            className="btn-ink mt-12 disabled:opacity-40"
          >
            Open it now ({hub.answeredPeople}/{hub.totalPeople})
          </button>
        )}

        <Link
          to="/ga/$sessionId"
          params={{ sessionId }}
          className="mt-10 block text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to the room
        </Link>
      </section>
    </main>
  );
}

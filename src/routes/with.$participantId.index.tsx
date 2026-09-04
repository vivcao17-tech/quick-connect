import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getPersonSessions } from "@/lib/conversations.functions";
import { savePersonNote } from "@/lib/notes.functions";
import { listMyAnswerSets } from "@/lib/remote.functions";
import { contactLink } from "@/lib/contact-link";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/with/$participantId/")({
  component: WithPersonPage,
  head: () => ({
    meta: [
      { title: "Everything you two answered — NoSure" },
      {
        name: "description",
        content: "Every set of questions you and this person have both answered, newest first.",
      },
      { property: "og:title", content: "Everything you two answered — NoSure" },
      {
        property: "og:description",
        content: "Every set of questions you two have both answered, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Everything you two answered — NoSure" },
      {
        name: "twitter:description",
        content: "Every set of questions you two have both answered, newest first.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Data = {
  name: string;
  realName: string;
  note: { nickname: string; contact: string; note: string };
  met: string;
  sessions: Awaited<ReturnType<typeof getPersonSessions>>["sessions"];
};


export function ago(iso: string) {
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

const field =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-primary";

function WithPersonPage() {
  const { participantId } = Route.useParams();
  const viewer = useViewer();
  const [data, setData] = useState<Data | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [sets, setSets] = useState<Awaited<ReturnType<typeof listMyAnswerSets>>["sets"]>([]);

  const load = useServerFn(getPersonSessions);
  const loadSets = useServerFn(listMyAnswerSets);
  const save = useServerFn(savePersonNote);

  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void load({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
        personKey: participantId,
      },
    })
      .then((result) => {
        setData(result);
        setNickname(result.note.nickname);
        setContact(result.note.contact);
        setNote(result.note.note);
      })
      .catch(() =>
        setData({
          name: "",
          realName: "",
          note: { nickname: "", contact: "", note: "" },
          met: "",
          sessions: [],
        }),
      );
  }, [load, participantId, viewer.ready, viewer.guestToken, viewer.profileId]);

  // Meeting someone new is the usual trigger for reusing a set, so the sets are
  // ready before the page even knows there is nothing between you two yet.
  useEffect(() => {
    if (!viewer.ready || !viewer.guestToken) return;
    void loadSets({
      data: {
        guestToken: viewer.guestToken,
        ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
      },
    })
      .then((result) => setSets(result.sets))
      .catch(() => setSets([]));
  }, [loadSets, viewer.ready, viewer.guestToken, viewer.profileId]);

  async function submit() {
    if (!viewer.guestToken || saving) return;
    setSaving(true);
    try {
      const saved = await save({
        data: {
          guestToken: viewer.guestToken,
          ...(viewer.profileId ? { profileId: viewer.profileId } : {}),
          personKey: participantId,
          nickname,
          contact,
          note,
        },
      });
      setData((current) =>
        current
          ? { ...current, note: saved, name: saved.nickname || current.realName }
          : current,
      );
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const sessions = data?.sessions ?? [];
  const name = data?.name || "them";
  const visible = showAll ? sessions : sessions.slice(0, 3);
  const link = contactLink(data?.note.contact ?? "");
  const lastTalked = sessions[0]?.lastActivity ?? "";

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <Link
          to="/people"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          People
        </Link>
        <h1 className="mt-6 text-4xl leading-tight">You and {name}</h1>
        {data?.note.nickname && data.realName && (
          <p className="mt-2 text-sm text-muted-foreground">Their name: {data.realName}</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {[
            data?.met,
            sessions.length === 1
              ? "1 session together"
              : `${sessions.length} sessions together`,
            lastTalked ? `Last talked ${ago(lastTalked)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* Private annotations — only ever shown to whoever wrote them. */}
        <div className="card-soft mt-8 px-6 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Just for you
            </p>
            <button
              onClick={() => setEditing((open) => !open)}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              {editing ? "Cancel" : data?.note.nickname || data?.note.contact || data?.note.note ? "Edit" : "Add"}
            </button>
          </div>

          {!editing && (
            <div className="mt-4 flex flex-col gap-2 text-base">
              {data?.note.contact ? (
                link ? (
                  <a
                    href={link.href}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    {link.label}
                  </a>
                ) : (
                  <p>{data.note.contact}</p>
                )
              ) : null}
              {data?.note.note && <p className="text-muted-foreground">{data.note.note}</p>}
              {!data?.note.contact && !data?.note.note && !data?.note.nickname && (
                <p className="text-muted-foreground">
                  Nickname, where you talk, and one line to remember them by.
                </p>
              )}
            </div>
          )}

          {editing && (
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Nickname (only you see it)"
                className={field}
              />
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="@instagram, phone, or a link"
                className={field}
              />
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Note — e.g. orientation group, sat next to me"
                className={field}
              />
              <button
                type="submit"
                disabled={saving}
                className="btn-quiet self-start hover:bg-secondary disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </form>
          )}
        </div>

        {sets.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl leading-tight">Send {name} a set you've already answered</h2>
            <p className="mt-2 text-muted-foreground">
              You won't answer anything again — they just get their own link.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {sets.map((set) => (
                <Link
                  key={set.sessionId}
                  to="/send/$sessionId"
                  params={{ sessionId: set.sessionId }}
                  className="card-soft block px-6 py-5"
                >
                  <p className="text-lg">{set.topic || "Three questions"}</p>
                  {set.firstQuestion && (
                    <p className="mt-2 text-base text-muted-foreground">{set.firstQuestion}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {data && sessions.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">Nothing between you yet.</p>
        )}

        <div className="mt-10 flex flex-col gap-3">
          {visible.map((session) => (
            <Link
              key={session.sessionId}
              to="/with/$participantId/$sessionId"
              params={{ participantId, sessionId: session.sessionId }}
              search={{}}

              className="card-soft block px-6 py-5"
            >
              <p className="text-lg">{session.topic || "Three questions"}</p>
              <p className="mt-3 text-xl">
                {session.different === 0 ? (
                  "Same answers"
                ) : (
                  <span className="text-primary">
                    {session.different} of {session.total} different
                  </span>
                )}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {session.messageCount === 0
                  ? "Nothing said yet"
                  : `${session.messageCount} ${session.messageCount === 1 ? "line" : "lines"}`}
                {" · "}
                {ago(session.lastActivity)}
                {session.unread > 0 && <span className="text-primary"> · new</span>}
              </p>
            </Link>
          ))}
        </div>

        {!showAll && sessions.length > 3 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-8 text-sm text-muted-foreground underline underline-offset-4"
          >
            See earlier
          </button>
        )}

        {sets.length > 0 && (
          <div className="mt-14 border-t border-border pt-10">
            <h2 className="text-2xl leading-tight">Send them a set you've already answered</h2>
            <p className="mt-2 text-muted-foreground">
              You won't answer anything again — they just get their own link.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {sets.map((set) => (
                <Link
                  key={set.sessionId}
                  to="/send/$sessionId"
                  params={{ sessionId: set.sessionId }}
                  className="card-soft block px-6 py-5"
                >
                  <p className="text-lg">{set.topic || "Three questions"}</p>
                  {set.firstQuestion && (
                    <p className="mt-2 text-base text-muted-foreground">{set.firstQuestion}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

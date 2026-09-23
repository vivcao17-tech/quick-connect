import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { PackPreview } from "@/components/PackPreview";
import { getPersonSessions } from "@/lib/conversations.functions";
import { savePersonNote } from "@/lib/notes.functions";
import { listMyAnswerSets } from "@/lib/remote.functions";
import { contactLink } from "@/lib/contact-link";
import { getWallLinks } from "@/lib/profile.functions";
import { useViewer } from "@/lib/viewer";

export const Route = createFileRoute("/with/$participantId/about")({
  component: WithPersonPage,
  head: () => ({
    meta: [
      { title: "About you two — NoSure" },
      {
        name: "description",
        content: "Every set of questions you and this person have both answered, newest first.",
      },
      { property: "og:title", content: "About you two — NoSure" },
      {
        property: "og:description",
        content: "Every set of questions you two have both answered, newest first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "About you two — NoSure" },
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

type Session = Data["sessions"][number];
type HistoryQuestion = Session["questions"][number];
type TopicGroup = {
  id: string;
  name: string;
  lastActivity: string;
  questions: HistoryQuestion[];
};

function groupQuestionsByTopic(sessions: Session[]): TopicGroup[] {
  const topics = new Map<string, TopicGroup>();
  const seen = new Set<string>();

  for (const session of sessions) {
    for (const question of session.questions) {
      if (seen.has(question.sessionQuestionId)) continue;
      seen.add(question.sessionQuestionId);

      const topicKey = question.topicId ?? "uncategorized";
      const current = topics.get(topicKey) ?? {
        id: topicKey,
        name: question.topic || "Other",
        lastActivity: question.lastActivity,
        questions: [],
      };
      current.questions.push(question);
      if (current.lastActivity < question.lastActivity) {
        current.lastActivity = question.lastActivity;
      }
      topics.set(topicKey, current);
    }
  }

  for (const topic of topics.values()) {
    topic.questions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }

  return [...topics.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

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
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [sets, setSets] = useState<Awaited<ReturnType<typeof listMyAnswerSets>>["sets"]>([]);
  const [wallHandle, setWallHandle] = useState("");

  const loadWalls = useServerFn(getWallLinks);
  useEffect(() => {
    void loadWalls({ data: { personKeys: [participantId] } })
      .then((result) => setWallHandle(result.walls[participantId] ?? ""))
      .catch(() => setWallHandle(""));
  }, [loadWalls, participantId]);

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
        if ("personKey" in result && result.personKey && result.personKey !== participantId) {
          void navigate({
            to: "/with/$participantId/about",
            params: { participantId: result.personKey },
            replace: true,
          });
        }
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
  }, [load, navigate, participantId, viewer.ready, viewer.guestToken, viewer.profileId]);

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
        current ? { ...current, note: saved, name: saved.nickname || current.realName } : current,
      );
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const sessions = data?.sessions ?? [];
  const name = data?.name || "them";
  const topicGroups = useMemo(() => groupQuestionsByTopic(sessions), [sessions]);
  const link = contactLink(data?.note.contact ?? "");
  const lastTalked = sessions[0]?.lastActivity ?? "";

  return (
    <main className="paper min-h-screen bg-background">
      <section className="mx-auto min-h-screen max-w-xl px-6 py-16">
        <Link
          to="/with/$participantId"
          params={{ participantId }}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to the conversation
        </Link>
        <h1 className="mt-6 text-4xl leading-tight">You and {name}</h1>
        {data?.note.nickname && data.realName && (
          <p className="mt-2 text-sm text-muted-foreground">Their name: {data.realName}</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {[
            data?.met,
            sessions.length === 1 ? "1 session together" : `${sessions.length} sessions together`,
            lastTalked ? `Last talked ${ago(lastTalked)}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {viewer.guestToken && (
          <Fold title="Preview">
            <PackPreview
              guestToken={viewer.guestToken}
              {...(viewer.profileId ? { profileId: viewer.profileId } : {})}
              personKey={participantId}
              name={name}
            />
          </Fold>
        )}

        {viewer.guestToken && (
          <Fold title="How you read each other">
            <PairImpressions
              guestToken={viewer.guestToken}
              profileId={viewer.profileId}
              personKey={participantId}
              name={name}
            />
          </Fold>
        )}

        {data && sessions.length === 0 && (
          <p className="mt-8 text-lg text-muted-foreground">Nothing between you yet.</p>
        )}

        {topicGroups.length > 0 && (
          <Fold title="Topics you've discussed" defaultOpen>
            <div className="flex flex-col gap-4">
              {topicGroups.map((topic) => (
                <section key={topic.id} className="card-soft overflow-hidden px-5 sm:px-6">
                  <header className="flex items-end justify-between gap-4 py-5">
                    <h2 className="text-xl leading-tight">{topic.name}</h2>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {topic.questions.length}{" "}
                      {topic.questions.length === 1 ? "question" : "questions"}
                      {topic.lastActivity ? ` · ${ago(topic.lastActivity)}` : ""}
                    </p>
                  </header>
                  <div className="border-t border-border">
                    {topic.questions.map((question) => (
                      <Link
                        key={question.sessionQuestionId}
                        to="/with/$participantId"
                        params={{ participantId }}
                        search={{ q: question.sessionQuestionId }}
                        className="group flex min-w-0 items-start gap-3 border-b border-border py-5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg leading-snug transition-colors group-hover:text-primary">
                            {question.text}
                          </span>
                          <span className="mt-3 block text-sm leading-relaxed text-muted-foreground">
                            <span className="block">You: {question.myLabel || "—"}</span>
                            <span className="block">
                              {name}:{" "}
                              {question.revealed
                                ? question.theirLabel || "—"
                                : `Waiting for ${name}`}
                            </span>
                          </span>
                          {(question.messageCount > 0 || question.unread > 0) && (
                            <span className="mt-2 block text-xs text-muted-foreground">
                              {question.messageCount}{" "}
                              {question.messageCount === 1 ? "line" : "lines"}
                              {question.unread > 0 && <span className="text-primary"> · new</span>}
                            </span>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 shrink-0 text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        >
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Fold>
        )}

        {/* Private annotations — only ever shown to whoever wrote them. */}
        <Fold title="Just for you">
        <div className="card-soft px-6 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Just for you
            </p>
            <button
              onClick={() => setEditing((open) => !open)}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              {editing
                ? "Cancel"
                : data?.note.nickname || data?.note.contact || data?.note.note
                  ? "Edit"
                  : "Add"}
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
        </Fold>

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
      </section>
    </main>
  );
}

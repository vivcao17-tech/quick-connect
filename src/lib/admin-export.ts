/** Turning one room record into a file you can keep. Pure formatting — no data fetching. */

type Option = { key: string; label: string; votes: number };

export type ExportableQuestion = {
  sessionQuestionId: string;
  orderIndex: number;
  text: string;
  questionType?: string;
  skipped: boolean;
  split: string | null;
  imbalance: number | null;
  totalVotes: number;
  secondsOnQuestion: number | null;
  answerWindowSeconds: number | null;
  revealedAt?: string | null;
  options: Option[];
  selfOptions?: Option[] | null;
};

export type ExportableSession = {
  id: string;
  kind: string;
  createdAt: string;
  endedAt?: string | null;
  durationSeconds: number | null;
  participants: string[];
  evenCount: number;
  lopsidedCount: number;
  questions: ExportableQuestion[];
};

function cell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pct(votes: number, total: number) {
  return total ? Math.round((votes / total) * 100) : "";
}

const HEADER = [
  "session_id",
  "kind",
  "session_started_at",
  "people",
  "question_number",
  "question_text",
  "answer_role",
  "skipped",
  "split_label",
  "option_a_label",
  "option_a_votes",
  "option_a_pct",
  "option_b_label",
  "option_b_votes",
  "option_b_pct",
  "option_c_label",
  "option_c_votes",
  "option_c_pct",
  "total_answers",
  "seconds_on_question",
  "answer_window_seconds",
  "revealed_at",
];

function questionRows(session: ExportableSession, question: ExportableQuestion) {
  const sets: { role: string; options: Option[] }[] = question.selfOptions
    ? [
        { role: "about_other", options: question.options },
        { role: "about_self", options: question.selfOptions },
      ]
    : [{ role: "about_self", options: question.options }];

  return sets.map(({ role, options }) => {
    const total = options.reduce((sum, option) => sum + option.votes, 0);
    const slot = (index: number) => {
      const option = options[index];
      return option ? [option.label, option.votes, pct(option.votes, total)] : ["", "", ""];
    };
    return [
      session.id,
      session.kind,
      session.createdAt,
      session.participants.length,
      question.orderIndex + 1,
      question.text,
      role,
      question.skipped ? "yes" : "no",
      question.split ?? "",
      ...slot(0),
      ...slot(1),
      ...slot(2),
      total,
      question.secondsOnQuestion ?? "",
      question.answerWindowSeconds ?? "",
      question.revealedAt ?? "",
    ];
  });
}

export function sessionToCsv(session: ExportableSession) {
  const lines = [HEADER.join(",")];
  for (const question of [...session.questions].sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const row of questionRows(session, question)) lines.push(row.map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function sessionToJson(session: ExportableSession) {
  return `${JSON.stringify(session, null, 2)}\n`;
}

export function downloadFile(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportFileName(session: ExportableSession, extension: "csv" | "json") {
  const day = session.createdAt.slice(0, 10);
  return `nosure-${session.kind}-${day}-${session.id.slice(0, 8)}.${extension}`;
}

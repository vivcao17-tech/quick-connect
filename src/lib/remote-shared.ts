export type OptionKey = "a" | "b" | "c";
export type Chip = { id: string; optionKey: OptionKey; text: string };
export type QuestionKind = "standard" | "impression" | "prediction";

/** Bank types that play as a plain A/B card (with or without reason chips). */
export const AB_TYPES = ["ab", "ab_reason"] as const;

export function kindOf(questionType?: string | null): QuestionKind {
  if (questionType === "impression") return "impression";
  if (questionType === "prediction") return "prediction";
  return "standard";
}
export type Snapshot = {
  text: string;
  kind?: QuestionKind;
  options: { key: OptionKey; label: string }[];
  chips: Chip[];
};
export type PlayQuestion = {
  sessionQuestionId: string;
  questionId: string;
  text: string;
  kind: QuestionKind;
  options: { key: OptionKey; label: string }[];
  chips: Chip[];
};

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function shortToken() {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function snapshotOf(row: {
  text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  question_type?: string | null;
  chips: { id: string; option_key: string; text: string }[];
}): Snapshot {
  return {
    text: row.text,
    kind: (row.question_type as QuestionKind | null) ?? "standard",
    options: [
      { key: "a", label: row.option_a },
      { key: "b", label: row.option_b },
      ...(row.option_c ? [{ key: "c" as const, label: row.option_c }] : []),
    ],
    chips: row.chips.map((chip) => ({
      id: chip.id,
      optionKey: chip.option_key as OptionKey,
      text: chip.text,
    })),
  };
}

export function toPlay(sq: {
  id: string;
  question_id: string;
  snapshot: unknown;
}): PlayQuestion {
  const snap = sq.snapshot as Snapshot;
  return {
    sessionQuestionId: sq.id,
    questionId: sq.question_id,
    text: snap.text,
    kind: snap.kind ?? "standard",
    options: snap.options,
    chips: snap.chips ?? [],
  };
}

import { snapshotOf } from "@/lib/remote-shared";
import type { Snapshot } from "@/lib/remote-shared";
import { PACKS, PACK_LABEL, PACK_READ_TITLE, PACK_TAGLINE, isPack } from "@/lib/packs";
import type { Pack, PackState } from "@/lib/packs";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const QUESTION_SELECT =
  "id, pack, question_type, first_round_role, spice_level, is_featured, text, option_a, option_b, option_c, stem_other, stem_self, follow_up, reason_chips(id, option_key, text)";

export type QuestionPick = {
  id: string;
  questionType: string;
  pack: Pack | null;
  snapshot: Snapshot;
};

type Row = {
  id: string;
  pack: string | null;
  question_type: string | null;
  first_round_role: string | null;
  spice_level: number | null;
  is_featured: boolean | null;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  stem_other: string | null;
  stem_self: string | null;
  follow_up: string | null;
  reason_chips: { id: string; option_key: string; text: string }[] | null;
};

function toPick(row: Row): QuestionPick {
  return {
    id: row.id,
    questionType: row.question_type ?? "ab",
    pack: isPack(row.pack) ? row.pack : null,
    snapshot: snapshotOf({ ...row, chips: row.reason_chips ?? [] }),
  };
}

/** Every question id these people have already answered, in any mode. */
export async function seenQuestionIds(
  admin: Admin,
  opts: { guestTokens?: (string | null)[]; profileIds?: (string | null)[] },
): Promise<Set<string>> {
  const tokens = (opts.guestTokens ?? []).filter((t): t is string => Boolean(t));
  const profiles = (opts.profileIds ?? []).filter((p): p is string => Boolean(p));
  if (tokens.length === 0 && profiles.length === 0) return new Set();

  const ids = new Set<string>();
  const collect = async (column: "guest_token" | "profile_id", values: string[]) => {
    if (values.length === 0) return;
    const { data } = await admin.from("session_participants").select("id").in(column, values);
    for (const row of data ?? []) ids.add(row.id);
  };
  await Promise.all([collect("guest_token", tokens), collect("profile_id", profiles)]);
  if (ids.size === 0) return new Set();

  const { data: answers } = await admin
    .from("answers")
    .select("question_id")
    .in("participant_id", [...ids]);
  return new Set((answers ?? []).map((a) => a.question_id));
}

/**
 * Tiered pick: featured and unseen first, then unseen (gentlest first), then
 * anything. Never blocks — a drained pack falls through to the legacy bank.
 */
function rank(rows: Row[], seen: Set<string>) {
  return [...rows].sort((a, b) => {
    const tier = (r: Row) => (seen.has(r.id) ? 2 : r.is_featured ? 0 : 1);
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if ((a.spice_level ?? 1) !== (b.spice_level ?? 1)) {
      return (a.spice_level ?? 1) - (b.spice_level ?? 1);
    }
    return a.id.localeCompare(b.id);
  });
}

async function fetchPackRows(
  admin: Admin,
  opts: { pack?: Pack | undefined; types: string[]; roles?: string[] | undefined },
) {
  let query = admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .in("mode", ["pair", "both"])
    .in("question_type", opts.types);
  if (opts.pack) query = query.eq("pack", opts.pack);
  if (opts.roles) query = query.in("first_round_role", opts.roles);
  const { data } = await query;
  return (data ?? []) as unknown as Row[];
}

/** Legacy fallback so a drained pack never blocks a round. */
async function legacyRows(admin: Admin, types: string[]) {
  const { data } = await admin
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("active", true)
    .in("mode", ["pair", "both"])
    .in("question_type", types)
    .lte("spice_level", 2)
    .eq("source", "legacy");
  return (data ?? []) as unknown as Row[];
}

export type PackCandidates = {
  pack: Pack | null;
  label: string;
  questions: QuestionPick[];
  impressions: QuestionPick[];
};

/**
 * The candidates one person chooses from. `pack: null` is the first round:
 * icebreakers and dividers plus one fixed impression read.
 */
export async function packCandidates(
  admin: Admin,
  opts: {
    pack?: Pack | undefined;
    guestTokens?: (string | null)[];
    profileIds?: (string | null)[];
    count?: number;
    impressionCount?: number;
    exclude?: string[];
  },
): Promise<PackCandidates> {
  const seen = await seenQuestionIds(admin, {
    ...(opts.guestTokens ? { guestTokens: opts.guestTokens } : {}),
    ...(opts.profileIds ? { profileIds: opts.profileIds } : {}),
  });
  const exclude = new Set(opts.exclude ?? []);
  const count = opts.count ?? 4;
  const impressionCount = opts.impressionCount ?? (opts.pack ? 2 : 1);

  const abRows = opts.pack
    ? await fetchPackRows(admin, { pack: opts.pack, types: ["ab", "ab_reason"] })
    : await fetchPackRows(admin, {
        types: ["ab", "ab_reason"],
        roles: ["icebreaker", "divider"],
      });
  const impressionRows = opts.pack
    ? await fetchPackRows(admin, { pack: opts.pack, types: ["impression"] })
    : await fetchPackRows(admin, { types: ["impression"], roles: ["impression"] });

  let ab = rank(
    abRows.filter((r) => !exclude.has(r.id)),
    seen,
  );
  if (ab.length < count) {
    const extra = rank(
      (await legacyRows(admin, ["ab", "ab_reason"])).filter(
        (r) => !exclude.has(r.id) && !ab.some((row) => row.id === r.id),
      ),
      seen,
    );
    ab = [...ab, ...extra];
  }

  let impressions = rank(
    impressionRows.filter((r) => !exclude.has(r.id)),
    seen,
  );
  if (impressions.length < impressionCount) {
    const extra = rank(
      (await legacyRows(admin, ["impression"])).filter(
        (r) => !exclude.has(r.id) && !impressions.some((row) => row.id === r.id),
      ),
      seen,
    );
    impressions = [...impressions, ...extra];
  }

  return {
    pack: opts.pack ?? null,
    label: opts.pack ? PACK_LABEL[opts.pack] : "First round",
    questions: ab.slice(0, count).map(toPick),
    impressions: impressions.slice(0, impressionCount).map(toPick),
  };
}

export async function packConfig(admin: Admin) {
  const { data } = await admin
    .from("pack_config")
    .select("pack, unlock_threshold, display_order")
    .order("display_order");
  const rows = (data ?? []) as unknown as {
    pack: string;
    unlock_threshold: number;
    display_order: number;
  }[];
  const fallback: Record<Pack, { threshold: number; order: number }> = {
    click: { threshold: 4, order: 1 },
    talk: { threshold: 5, order: 2 },
    bring_out: { threshold: 5, order: 3 },
    clash: { threshold: 6, order: 4 },
  };
  for (const row of rows) {
    if (isPack(row.pack)) {
      fallback[row.pack] = { threshold: row.unlock_threshold, order: row.display_order };
    }
  }
  return fallback;
}

export type PreviewItem = {
  sessionId: string;
  sessionQuestionId: string;
  text: string;
  myLabel: string;
  theirLabel: string;
  myReason: string;
  theirReason: string;
  matched: boolean | null;
};

export type PackPreview = PackState & {
  same: number;
  different: number;
  items: PreviewItem[];
};

/** Which pack the pair should play next: the nearest one still short of its threshold. */
export function nextPack(previews: PackPreview[]): Pack {
  const open = previews.filter((p) => !p.unlocked).sort((a, b) => a.order - b.order);
  const first = open[0] ?? previews.sort((a, b) => a.order - b.order)[0];
  return (first?.pack ?? PACKS[0]) as Pack;
}

/** Groups a pair's shared, revealed questions into the four packs. */
export async function packPreview(
  admin: Admin,
  questions: {
    sessionId: string;
    sessionQuestionId: string;
    questionId: string;
    text: string;
    revealed: boolean;
    myLabel: string;
    theirLabel: string;
    myReason: string;
    theirReason: string;
    matched: boolean | null;
  }[],
): Promise<PackPreview[]> {
  const usable = questions.filter((q) => q.revealed && q.myLabel && q.theirLabel);
  const ids = [...new Set(usable.map((q) => q.questionId))];
  const packOf = new Map<string, Pack>();
  if (ids.length > 0) {
    const { data } = await admin.from("questions").select("id, pack").in("id", ids);
    for (const row of (data ?? []) as { id: string; pack: string | null }[]) {
      if (isPack(row.pack)) packOf.set(row.id, row.pack);
    }
  }

  const config = await packConfig(admin);
  return PACKS.map((pack) => {
    const items = usable.filter((q) => packOf.get(q.questionId) === pack);
    const answered = items.length;
    const threshold = config[pack].threshold;
    return {
      pack,
      label: PACK_LABEL[pack],
      tagline: PACK_TAGLINE[pack],
      readTitle: PACK_READ_TITLE[pack],
      threshold,
      order: config[pack].order,
      answered,
      unlocked: answered >= threshold,
      remaining: Math.max(0, threshold - answered),
      same: items.filter((q) => q.matched === true).length,
      different: items.filter((q) => q.matched === false).length,
      items: items.map((q) => ({
        sessionId: q.sessionId,
        sessionQuestionId: q.sessionQuestionId,
        text: q.text,
        myLabel: q.myLabel,
        theirLabel: q.theirLabel,
        myReason: q.myReason,
        theirReason: q.theirReason,
        matched: q.matched,
      })),
    };
  }).sort((a, b) => a.order - b.order);
}

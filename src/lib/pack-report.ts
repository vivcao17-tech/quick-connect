export const REPORT_PACKS = ["click", "talk", "bring_out"] as const;
export type ReportPack = (typeof REPORT_PACKS)[number];

export function isReportPack(value: unknown): value is ReportPack {
  return typeof value === "string" && REPORT_PACKS.some((pack) => pack === value);
}

export const REPORT_AXES = {
  click: [
    { key: "planning", name: "Planning", left: "Plan ahead", right: "Figure it out" },
    { key: "social_energy", name: "Social energy", left: "One-on-one", right: "Group" },
    { key: "tempo", name: "Tempo", left: "Early / fast reply", right: "Late / slow reply" },
    { key: "staying_power", name: "Staying power", left: "Finish it", right: "Switch" },
  ],
  talk: [
    { key: "depth", name: "Depth", left: "One thing deep", right: "Many things" },
    { key: "how_why", name: "How vs why", left: "Mechanism", right: "Meaning" },
    { key: "learning_mode", name: "Learning mode", left: "Theory first", right: "Try first" },
    { key: "people_ideas", name: "People vs ideas", left: "People", right: "Ideas" },
  ],
  bring_out: [
    { key: "initiating", name: "Initiating", left: "Start things", right: "Make them happen" },
    { key: "words_actions", name: "Words vs actions", left: "Words", right: "Actions" },
    { key: "push_comfort", name: "Push vs comfort", left: "Challenge", right: "Reassure" },
    { key: "group_one", name: "Group vs one-on-one", left: "Group", right: "One-on-one" },
  ],
} as const;

// Some questions phrase their A/B options in the reverse direction from an axis.
const REVERSED = new Set(["meet_click_03", "talk_12", "talk_15", "34f13a21-6330-4f1f-ba43-ebe939f86741"]);

export type ReportAnswer = {
  questionId: string;
  optionKey: string;
  questionKey: string | null;
  axis: string | null;
};

export function summarizePackAnswers(pack: ReportPack, answers: ReportAnswer[]) {
  const unique = new Map<string, ReportAnswer>();
  for (const answer of answers) {
    if ((answer.optionKey === "a" || answer.optionKey === "b") && !unique.has(answer.questionId)) {
      unique.set(answer.questionId, answer);
    }
  }
  const distinct = [...unique.values()];
  return {
    answered: distinct.length,
    axes: REPORT_AXES[pack].map((axis) => {
      const tagged = distinct.filter((answer) => answer.axis === axis.key);
      const right = tagged.filter((answer) => {
        const reverse = REVERSED.has(answer.questionKey ?? "") || REVERSED.has(answer.questionId);
        return reverse ? answer.optionKey === "a" : answer.optionKey === "b";
      }).length;
      return { ...axis, count: tagged.length, right, position: tagged.length ? (right / tagged.length) * 100 : 50 };
    }),
  };
}
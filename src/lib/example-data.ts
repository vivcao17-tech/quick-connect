// Sample content for the two read-only example pages. Swapping this file for
// real data must not require any layout changes — the pages render purely from
// these shapes.

export type ExampleImpression = {
  key: string;
  text: string;
  optionA: string;
  optionB: string;
  tagA: string;
  tagB: string;
};

export type ExampleGuesser = {
  name: string;
  picks: Record<string, "a" | "b">;
};

export type ExamplePreviewRow = {
  key: string;
  question: string;
  optionA: string;
  optionB: string;
  mine: "a" | "b";
  theirs: "a" | "b";
};

export const exampleImpressions = {
  subjectName: "Sam",
  questions: [
    {
      key: "know_wrong",
      text: "When something goes wrong, Sam",
      optionA: "Says it right away",
      optionB: "Handles it and mentions it later",
      tagA: "Says it",
      tagB: "Later",
    },
    {
      key: "know_better_at",
      text: "Sam is better at",
      optionA: "Starting things",
      optionB: "Finishing things",
      tagA: "Starting",
      tagB: "Finishing",
    },
    {
      key: "know_privately",
      text: "Privately, Sam is more",
      optionA: "Chaotic than expected",
      optionB: "Organized than expected",
      tagA: "Chaotic",
      tagB: "Organized",
    },
    {
      key: "bring_i1",
      text: "In your friend group, does Sam…",
      optionA: "start plans",
      optionB: "make them happen",
      tagA: "Start plans",
      tagB: "Make it happen",
    },
    {
      key: "know_host",
      text: "Sam would rather",
      optionA: "Host",
      optionB: "Be invited",
      tagA: "Host",
      tagB: "Invited",
    },
  ] satisfies ExampleImpression[],
  guessers: [
    { name: "Jordan", picks: { know_wrong: "a", know_better_at: "a", know_privately: "b", bring_i1: "a", know_host: "a" } },
    { name: "Ari", picks: { know_wrong: "b", know_better_at: "b", know_privately: "a", bring_i1: "b", know_host: "b" } },
    { name: "Taylor", picks: { know_wrong: "a", know_better_at: "b", know_privately: "b", bring_i1: "a", know_host: "b" } },
    { name: "Morgan", picks: { know_wrong: "b", know_better_at: "a", know_privately: "a", bring_i1: "b", know_host: "a" } },
    { name: "Casey", picks: { know_wrong: "a", know_better_at: "b", know_privately: "b", bring_i1: "b", know_host: "a" } },
  ] satisfies ExampleGuesser[],
};

export const examplePreview = {
  partnerName: "Jordan",
  rows: [
    {
      key: "plans",
      question: "When plans change last minute…",
      optionA: "I go with it",
      optionB: "It throws me off",
      mine: "a",
      theirs: "a",
    },
    {
      key: "texting",
      question: "Over text, you usually send…",
      optionA: "Short replies",
      optionB: "Long messages",
      mine: "a",
      theirs: "b",
    },
    {
      key: "saturday",
      question: "A free Saturday looks like…",
      optionA: "Quiet time to myself",
      optionB: "Out with people",
      mine: "b",
      theirs: "b",
    },
    {
      key: "disagree",
      question: "When you disagree with a friend…",
      optionA: "I bring it up",
      optionB: "I let it go",
      mine: "a",
      theirs: "b",
    },
    {
      key: "ontime",
      question: "Showing up to things, you are…",
      optionA: "Early",
      optionB: "Right on time",
      mine: "a",
      theirs: "a",
    },
  ] satisfies ExamplePreviewRow[],
  summary: [
    "You lined up on 3 of 5.",
    "Biggest gap: you bring things up, Jordan lets them go.",
  ],
};

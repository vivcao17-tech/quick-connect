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
      key: "gone-wrong",
      text: "When something goes wrong, Sam…",
      optionA: "Fixes it quietly",
      optionB: "Talks it out first",
      tagA: "Quiet fix",
      tagB: "Talks first",
    },
    {
      key: "called",
      text: "Sam would rather be called…",
      optionA: "Kind",
      optionB: "Interesting",
      tagA: "Kind",
      tagB: "Interesting",
    },
    {
      key: "start-finish",
      text: "Sam is better at…",
      optionA: "Starting things",
      optionB: "Finishing things",
      tagA: "Starting",
      tagB: "Finishing",
    },
    {
      key: "chaotic-organized",
      text: "Privately, Sam is more…",
      optionA: "Chaotic",
      optionB: "Organized",
      tagA: "Chaotic",
      tagB: "Organized",
    },
    {
      key: "host-invited",
      text: "Sam would rather…",
      optionA: "Host",
      optionB: "Be invited",
      tagA: "Host",
      tagB: "Invited",
    },
  ] satisfies ExampleImpression[],
  guessers: [
    { name: "Jordan", picks: { "gone-wrong": "a", called: "a", "start-finish": "a", "chaotic-organized": "b", "host-invited": "a" } },
    { name: "Ari", picks: { "gone-wrong": "b", called: "b", "start-finish": "b", "chaotic-organized": "a", "host-invited": "b" } },
    { name: "Taylor", picks: { "gone-wrong": "a", called: "a", "start-finish": "b", "chaotic-organized": "b", "host-invited": "b" } },
    { name: "Morgan", picks: { "gone-wrong": "b", called: "a", "start-finish": "a", "chaotic-organized": "a", "host-invited": "a" } },
    { name: "Casey", picks: { "gone-wrong": "a", called: "b", "start-finish": "b", "chaotic-organized": "b", "host-invited": "a" } },
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

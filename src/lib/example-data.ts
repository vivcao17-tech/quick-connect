// Sample content for the two read-only example pages. Swapping this file for
// real data must not require any layout changes — the pages render purely from
// these shapes.

export type ExampleImpression = {
  key: string;
  text: string;
  optionA: string;
  optionB: string;
  /** The subject's own answer. */
  self: "a" | "b";
  guessesA: number;
  guessesB: number;
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
      self: "a",
      guessesA: 3,
      guessesB: 2,
    },
    {
      key: "called",
      text: "Sam would rather be called…",
      optionA: "Kind",
      optionB: "Interesting",
      self: "b",
      guessesA: 4,
      guessesB: 1,
    },
    {
      key: "start-finish",
      text: "Sam is better at…",
      optionA: "Starting things",
      optionB: "Finishing things",
      self: "a",
      guessesA: 2,
      guessesB: 2,
    },
    {
      key: "chaotic-organized",
      text: "Privately, Sam is more…",
      optionA: "Chaotic",
      optionB: "Organized",
      self: "b",
      guessesA: 1,
      guessesB: 4,
    },
    {
      key: "host-invited",
      text: "Sam would rather…",
      optionA: "Host",
      optionB: "Be invited",
      self: "b",
      guessesA: 2,
      guessesB: 3,
    },
  ] satisfies ExampleImpression[],
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

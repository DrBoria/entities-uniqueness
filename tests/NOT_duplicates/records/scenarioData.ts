// Fixture: two UNRELATED record constants whose only apparent similarity is
// that both happen to use the same numeric keys (scenario indices).
export const CATEGORIES: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
};

export const FLOW: Record<number, string[]> = {
  1: ["a"],
  2: ["b"],
  3: ["c"],
};

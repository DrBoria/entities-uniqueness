// Fixture: two maps with the SAME keys but DIFFERENT value types.
// Property names alone must not make them "identical" — the properties
// signal must be discounted by the type disagreement.

export const DISPLAY_UNIT: Record<string, string> = {
  systolic: "mm[Hg]",
  heartRate: "/min",
  weight: "kg",
};

export const UNIT_RANGE: Record<string, number> = {
  systolic: 300,
  heartRate: 250,
  weight: 317,
};

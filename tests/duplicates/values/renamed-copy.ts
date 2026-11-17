// Two config objects with DIFFERENT names but IDENTICAL values (including nested
// objects and arrays). This is the "renamed copy" the values engine must catch:
// the shape matchers see the same field names, but only the VALUES prove it is a
// copy rather than two configs that happen to share a shape.

export const THEME_LIGHT = {
	name: "light",
	colors: { bg: "#ffffff", fg: "#111111", accent: "#0066cc" },
	spacing: [4, 8, 16],
	radius: 6,
	dark: false,
};

export const DAY_PALETTE = {
	name: "light",
	colors: { bg: "#ffffff", fg: "#111111", accent: "#0066cc" },
	spacing: [4, 8, 16],
	radius: 6,
	dark: false,
};
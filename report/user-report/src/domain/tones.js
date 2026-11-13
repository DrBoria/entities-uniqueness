"use strict";

// The colour keys code-diff paints with. The MODEL owns the colours (the pair
// theme); code-diff only receives them. One tone per lane state: `same` for a
// correspondence, `differs` for a row that breaks it, each with a stronger `hot`
// fill for the lane under the pointer.

import { pairTheme } from "../components/pair/theme";

export const tones = {
	same: { fill: pairTheme.wash.same, line: pairTheme.wash.same, hot: pairTheme.wash.hot },
	differs: { fill: pairTheme.wash.diff, line: pairTheme.wash.diff, hot: pairTheme.wash.hotDiff },
};

// The theme code-diff draws its chrome with (paper, ink, ribbons, fonts).
export const boardTheme = {
	paper: pairTheme.chrome.panelAlt,
	paint: pairTheme.mark.same,
	paintInk: pairTheme.chrome.text,
	ribbon: pairTheme.chrome.text,
	panel: pairTheme.chrome.panel,
	edge: pairTheme.chrome.border,
	edgeStrong: pairTheme.chrome.borderStrong,
	text: pairTheme.chrome.text,
	dim: pairTheme.chrome.dim,
	faint: pairTheme.chrome.faint,
	mono: pairTheme.font.mono,
};

"use strict";

import { theme } from "../../theme";

// ── THE PAIR THEME ────────────────────────────────────────────────────────
//
// One file decides every colour this view uses: the wash behind a line, the
// band that connects it to its twin, the editor tokens, and the chrome the
// components borrow from the report. No component in `pair/` knows a hex.

// The row BAND is a whisper: the code on top of it keeps its own colours. One band per
// row is painted (nested lanes no longer stack), so this value is what the reader sees —
// it has to be visible, not invisible, because it is the only "this row is on the lane".
const A = 0.09;
const SAME = "255, 107, 107";
// A row that BREAKS a correspondence is a note, not an error: a cool green at half
// the lane's alpha. A warm tint read as "something is wrong here".
const A_DIFF = 0.06;
const DIFF = "120, 200, 170";
// THE ONE LANE under the pointer. Every other row on the board is a whisper, and
// only the lane the reader points at is allowed to be a mark — a wash that is the
// same on every row is not a highlight, it is a background.
const A_HOT = 0.16;
// The MARK over the exact occurrence is stronger than the band it sits on — otherwise
// "this range is the one the lane is about" was told in the same colour as "this row
// is on the lane", which is no information at all.
const A_MARK = 0.18;
// The occurrence mark is a DIFFERENT hue from the red band: amber on red, never red on
// red. A red mark over a red wash vanished into it ("don't do red on red"); a warm amber
// highlighter reads as "this exact word" on top of the cool red "this row is on a lane".
const MARK = "255, 193, 94";

const rgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;

// Editor tokens: what Prism emits, coloured like a dark editor theme.
const TOKEN = {
	comment: "#5c6773",
	keyword: "#c792ea",
	string: "#c3e88d",
	number: "#f78c6c",
	function: "#82aaff",
	className: "#ffcb6b",
	operator: "#89ddff",
	decorator: "#f07178",
};

export const pairTheme = {
	alpha: A,
	// A line that exists on both sides. The band is the same colour as the wash:
	// the wash is the row, the band is the road between the two rows.
	band: { same: `rgb(${SAME})`, diff: `rgb(${DIFF})` },
	wash: { same: rgba(SAME, A), diff: rgba(DIFF, A_DIFF), hot: rgba(SAME, A_HOT), hotDiff: rgba(DIFF, 0.12) },
	// The exact occurrence a lane is about: an AMBER highlighter over the red band, painted
	// BEHIND the glyphs so the token colour survives. Never red on red.
	mark: { same: rgba(MARK, 0.26), diff: rgba(DIFF, 0.16) },
	// The ribbon itself: a visible ROAD through the corridor, stronger than the row wash
	// so the path between columns reads on a dark surface (the whisper-alpha wash made
	// every ribbon invisible). ONE calm shade from end to end — never a slab. `hot` is
	// the same hue held a little stronger for the lane under the pointer, painted ONCE
	// (the board never lays the road twice, which stacked alpha into a wild bright bend).
	ribbon: { same: rgba(SAME, 0.3), diff: rgba(DIFF, 0.24), hot: rgba(SAME, 0.44), hotDiff: rgba(DIFF, 0.36) },
	token: TOKEN,
	chrome: {
		panel: theme.color.panel,
		panelAlt: theme.color.panelAlt,
		border: theme.color.border,
		borderStrong: theme.color.borderStrong,
		text: theme.color.text,
		dim: theme.color.textDim,
		faint: theme.color.textFaint,
		// The line-number plate: a shade lighter than the code surface, so the
		// numbers read as a separate strip the code slides under.
		numberPlate: "#35435f",
		accent: theme.color.accent,
	},
	font: theme.font,
	radius: theme.radius,
};

// The token palette, as a styled-components interpolation. Prism emits spans of
// class `token token-*`; they are coloured by nesting, so the palette stays in
// this file and no component carries a CSS string.
export const tokenStyles = (selector = ".token") => `
	${selector}.comment, ${selector}.prolog, ${selector}.doctype, ${selector}.cdata { color: ${TOKEN.comment}; font-style: italic; }
	${selector}.keyword, ${selector}.boolean, ${selector}.important { color: ${TOKEN.keyword}; }
	${selector}.string, ${selector}.template-string, ${selector}.regex, ${selector}.char, ${selector}.attr-value { color: ${TOKEN.string}; }
	${selector}.number { color: ${TOKEN.number}; }
	${selector}.function, ${selector}.method, ${selector}.property-access { color: ${TOKEN.function}; }
	${selector}.class-name, ${selector}.builtin, ${selector}.constant, ${selector}.symbol { color: ${TOKEN.className}; }
	${selector}.operator, ${selector}.punctuation { color: ${TOKEN.operator}; }
	${selector}.decorator, ${selector}.annotation, ${selector}.attr-name { color: ${TOKEN.decorator}; }
`;

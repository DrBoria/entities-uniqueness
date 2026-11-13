"use strict";

const { MARK, ROW, SIGNAL, SIGNAL_ORDER } = require("../../../constants");

// WHY A ROW IS "SIMILAR" — the five groups, marked ON THE CODE.
//
// A pair of different entities can still be similar, and the reader who sees
// two different names is right to ask "what exactly is the same here?". The
// answer is a mark per comparison group on the very lines those groups looked at:
//
//   properties   a `name: type` member declaration
//   methods      a method name
//   signature    a method's parameter list and return type
//   name         the entity's own name (the declaration head)
//   inheritance  an `extends` / `implements` clause
//
// A group's mark is `same` when THAT group cannot tell the two rows apart, and
// `differs` when it can. The marks are a READER'S AID computed from the two texts,
// not the matcher (which works on the flat member lists); the authoritative
// numbers always come from `decision`.

const SIGNAL_KEYS = SIGNAL_ORDER;

const textOf = (side) => (side?.words ? side.words.map((w) => w.text).join("") : side?.text ?? "");

// A property declaration: `name?: type` / `readonly name: type`. Returns the
// name and the canonical type, or null when the line is not a property.
const propertyOf = (text) => {
	const m = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*(\?)?\s*:\s*(.+?)\s*;?\s*$/.exec(String(text ?? ""));
	if (!m) return null;
	// A method signature has a `(` before the `:` — not a property.
	if (/\(/.test(m[1])) return null;

	return { name: m[1], type: m[3].replace(/\s+/g, " ").trim() };
};

// A method declaration: `name(params): ret` (with optional modifiers).
const methodOf = (text) => {
	const m = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|abstract\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*[{;]?\s*$/.exec(String(text ?? ""));
	if (!m) return null;

	return { name: m[1], params: m[2].replace(/\s+/g, " ").trim(), returnType: (m[3] ?? "").replace(/\s+/g, " ").trim() };
};

// The entity name on a declaration head: `class X`, `interface X`, `type X`, `enum X`.
const nameOf = (text) => {
	const m = /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(String(text ?? ""));

	return m ? m[1] : null;
};

// The heritage clause of a head: everything after `extends`/`implements`.
const heritageOf = (text) => {
	const m = /\b(?:extends|implements)\s+(.+?)\s*\{?\s*$/.exec(String(text ?? ""));

	return m ? m[1].replace(/\s+/g, " ").trim() : null;
};

const mark = (state) => (state ? state : null);

// One row → `{ properties, methods, signature, name, inheritance }`, each
// `"same"`, `"differs"` or absent. An EQUAL row is the strongest statement: the
// two lines are identical, so every group that speaks about it agrees.
const markRow = (row) => {
	const left = textOf(row.left);
	const right = textOf(row.right);
	const both = Boolean(row.left && row.right);

	if (row.type === ROW.Equal) {
		const marks = {};
		if (propertyOf(left)) marks[SIGNAL.Properties] = MARK.Same;
		if (methodOf(left)) {
			marks[SIGNAL.Methods] = MARK.Same;
			marks[SIGNAL.Signature] = MARK.Same;
		}
		if (nameOf(left)) marks[SIGNAL.Name] = MARK.Same;
		if (heritageOf(left)) marks[SIGNAL.Inheritance] = MARK.Same;

		return Object.keys(marks).length > 0 ? marks : null;
	}

	const marks = {};
	const lp = propertyOf(left);
	const rp = propertyOf(right);
	if (lp || rp) marks[SIGNAL.Properties] = lp && rp && lp.name === rp.name && lp.type === rp.type ? MARK.Same : MARK.Differs;

	const lm = methodOf(left);
	const rm = methodOf(right);
	if (lm || rm) {
		marks[SIGNAL.Methods] = lm && rm && lm.name === rm.name ? MARK.Same : MARK.Differs;
		marks[SIGNAL.Signature] = lm && rm && lm.params === rm.params && lm.returnType === rm.returnType ? MARK.Same : MARK.Differs;
	}

	const ln = nameOf(left);
	const rn = nameOf(right);
	if (ln || rn) marks[SIGNAL.Name] = ln && rn && ln === rn ? MARK.Same : MARK.Differs;

	const lh = heritageOf(left);
	const rh = heritageOf(right);
	if (lh || rh) marks[SIGNAL.Inheritance] = lh && rh && lh === rh ? MARK.Same : MARK.Differs;

	void both;

	return Object.keys(marks).length > 0 ? marks : null;
};

// ── The MIDDLE pane: what the row says in COMMON, and where it diverges ─────
const runsOf = (words) => {
	const runs = [];
	for (const word of words ?? []) {
		const last = runs[runs.length - 1];
		if (last && last.changed === word.changed) last.text += word.text;
		else runs.push({ changed: word.changed, text: word.text });
	}

	return runs;
};

const overlapOf = (row) => {
	if (row.type === ROW.Equal) return { head: "≡", parts: [] };
	if (row.type === ROW.Remove) return { head: "−", parts: [{ text: "only in A" }], oneSide: "left" };
	if (row.type === ROW.Add) return { head: "+", parts: [{ text: "only in B" }], oneSide: "right" };

	const leftRuns = runsOf(row.left?.words);
	const rightRuns = runsOf(row.right?.words).filter((run) => run.changed);
	const parts = [];
	const slots = {};
	let n = 0;
	for (const run of leftRuns) {
		if (!run.changed) {
			const last = parts[parts.length - 1];
			if (last && last.slot == null) last.text += run.text;
			else parts.push({ text: run.text });
			continue;
		}
		n += 1;
		const right = rightRuns[n - 1]?.text ?? "";
		slots[n] = { left: run.text, right };
		parts.push({ slot: n, text: run.text, right });
	}

	return { head: "≠", parts, slots };
};

// What each group can point at IN THIS ROW (raw material for the board).
const annotOf = (row) => {
	const leftText = textOf(row.left);
	const rightText = textOf(row.right);

	return {
		properties: { left: propertyOf(leftText), right: propertyOf(rightText) },
		methods: { left: methodOf(leftText), right: methodOf(rightText) },
		signature: { left: methodOf(leftText), right: methodOf(rightText) },
		name: { left: nameOf(leftText), right: nameOf(rightText) },
		inheritance: { left: heritageOf(leftText), right: heritageOf(rightText) },
	};
};

// Is this LINE duplicated? Does its exact text appear on the other side?
const lineSet = (list, side) => {
	const set = new Set();
	for (const row of list) {
		if (row.type === ROW.Fold || !row[side]) continue;
		const text = textOf(row[side]).trim();
		if (text) set.add(text);
	}

	return set;
};

const annotate = (rows) => {
	const counts = Object.fromEntries(SIGNAL_KEYS.map((key) => [key, { same: 0, differs: 0 }]));
	const leftLines = lineSet(rows, "left");
	const rightLines = lineSet(rows, "right");
	const sameOnOtherSide = (row) => {
		const leftText = row.left ? textOf(row.left).trim() : "";
		const rightText = row.right ? textOf(row.right).trim() : "";

		return {
			dupLeft: Boolean(leftText) && rightLines.has(leftText),
			dupRight: Boolean(rightText) && leftLines.has(rightText),
		};
	};

	const walk = (list) =>
		list.map((row) => {
			if (row.type === ROW.Fold) return { ...row, rows: walk(row.rows) };
			const marks = markRow(row);
			const overlap = overlapOf(row);
			const annot = annotOf(row);
			const dup = sameOnOtherSide(row);
			if (!marks) return { ...row, overlap, annot, ...dup };
			for (const [key, value] of Object.entries(marks)) counts[key][value] += 1;

			return { ...row, marks, overlap, annot, ...dup };
		});

	return { rows: walk(rows), counts };
};

module.exports = { annotate, markRow, propertyOf, methodOf, nameOf, heritageOf, SIGNAL_KEYS };

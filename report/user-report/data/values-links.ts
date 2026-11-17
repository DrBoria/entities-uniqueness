"use strict";

// VALUES links: one link per shared value leaf, anchored on the VALUE TEXT as
// written in the source (`25`, `"eu-west-1"`, `true`) — not on the key, which a
// renamed copy changes on every line. Each side's leaf lines are resolved from
// its OWN tree against the raw source span and looked up by the row's own
// per-side path, so a renamed right side anchors on its own rows.

import { wordOf } from "./word";
import { leavesOf, sourceText } from "../../matchers/values/leaf-paths";

// path → declaration line: walk the raw lines in declaration order, finding
// each leaf's value at or after the previous leaf's spot. A value repeated on
// one line (`["a", "a"]`) advances the column, not the line.
const linesOfLeaves = (tree, span) => {
	const out = new Map();
	if (!tree || !span || !span.lines) return out;
	let lineAt = 0;
	let colAt = 0;
	for (const leaf of leavesOf(tree)) {
		const text = sourceText(leaf.text);
		if (!text || text === "ƒ") continue;
		let found = null;
		for (let i = lineAt; i < span.lines.length && found === null; i += 1) {
			const from = i === lineAt ? colAt : 0;
			const at = String(span.lines[i]).indexOf(text, from);
			if (at >= 0) found = { line: (span.startLine ?? 1) + i, col: at + text.length };
		}
		if (found === null) continue;
		out.set(leaf.path, found.line);
		lineAt = found.line - (span.startLine ?? 1);
		colAt = found.col;
	}

	return out;
};

const anchorOf = (side, row, lines) => {
	const text = row[side]?.text;
	if (!text) return null;
	// Tree rows carry per-side paths; set rows (enum ↔ union) name the value
	// itself on both sides — the text IS the anchor, no line hint needed.
	const path = (side === "left" ? row.leftPath : row.rightPath) ?? row.name;
	const line = lines.get(path);

	return { name: text, key: `${path}:${side}`, ...(line === undefined ? {} : { line }) };
};

/** One link per leaf of the Values model, anchored on the value text. A shared
 *  leaf is a duplicate (red): identical text = 100%, paired-but-different text
 *  = 50% (the correspondence holds, the content does not). A leaf on one side
 *  only is unique (green stub). */
const valuesLinks = (model, leftSpan, rightSpan) => {
	if (!model || !model.rows) return [];
	const word = wordOf("values", 1);
	const leftLines = linesOfLeaves(model.leftTree ?? null, leftSpan);
	const rightLines = linesOfLeaves(model.rightTree ?? null, rightSpan);
	const links = [];
	for (const row of model.rows) {
		const left = anchorOf("left", row, leftLines);
		const right = anchorOf("right", row, rightLines);
		if (!left && !right) continue;
		const shared = row.shared === true;
		const degree = row.same ? 1 : 0.5;
		const label = shared ? (degree >= 1 ? word : `${word} · ${Math.round(degree * 100)}%`) : word;
		// A one-sided leaf keeps ONLY its own end: the absent side must not
		// borrow the present end's anchor (that would locate a false twin and
		// hide the inter-line continuation). resolveLanes adds the gap end.
		links.push({ connectionId: `same:value:${row.name}`, label, tone: shared ? "same" : "differs", leftColumn: "0", rightColumn: "1", left, right });
	}

	return links;
};

export { valuesLinks, linesOfLeaves };
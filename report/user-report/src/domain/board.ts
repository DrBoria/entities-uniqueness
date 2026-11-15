"use strict";

// ── THE BOARD MODEL ────────────────────────────────────────────────────────
//
// All the visual math is code-diff's: it aligns the two spans into rows
// (`diffLines`) and resolves the model's semantic links into drawn lanes with
// marks and twins (`resolveLanes`). This module only arranges the result into the
// columns/items code-diff renders — it never computes a range or pairs a row.

import { diffLines, resolveLanes } from "@md-code/code-diff";

const textOf = (cell) => (cell == null ? "" : cell.words ? cell.words.map((w) => w.text).join("") : (cell.text ?? ""));

// The rows code-diff aligns, as plain spans of text.
const spanOf = (side) => ({ startLine: side.startLine, lines: side.lines ?? [] });

// Flatten folded runs so a lane can name any row, then keep the fold structure
// for the renderer (a fold row carries its hidden rows).
const flatten = (rows) => {
	const out = [];
	for (const row of rows) {
		if (row.type === "fold" && row.rows) out.push(...flatten(row.rows));
		else out.push(row);
	}

	return out;
};

// The standing marks of one item: every lane mark that sits on this column/line.
// code-diff paints these behind the glyphs; the lane under the pointer adds the
// focused (strong) mark itself, from the connection's marks + twins.
const marksFor = (lanes, column, line) => {
	const marks = [];
	for (const lane of lanes) {
		for (const mark of lane.marks ?? []) {
			if (mark.column === column && String(mark.line) === String(line)) marks.push({ from: mark.from, to: mark.to });
		}
	}

	return marks;
};

// One column of items: only the rows that carry a cell in this column (a row
// written on the other side alone is not a blank filler here). `parentLine` is
// the entity's declaration line — the head of its block, drawn emphasised.
const columnOf = (rows, lanes, index, path, parentLine) => ({
	id: String(index),
	kind: "items",
	mirrored: index >= 1,
	path,
	items: rows
		.filter((row) => row.cells?.[index] != null)
		.map((row) => {
			const cell = row.cells[index];
			const id = String(cell.no);

			return { id, plate: id, text: textOf(cell), blockParent: parentLine != null && id === String(parentLine), marks: marksFor(lanes, String(index), id) };
		}),
});

// THE BLOCK of one side: the entity's declaration line is the parent, every other
// line of its body a member. Hovering any member lights the whole entity — the
// declaration head included — so the reader sees "this type and all its members",
// not one isolated property. Both sides get their own block; the correspondence
// lanes still tie the matching members across the two columns.
const blockOf = (side, index) => {
	if (!side || side.startLine == null) return null;
	const parent = String(side.startLine);
	const members = (side.lines ?? []).map((_, i) => String(side.startLine + i)).filter((id) => id !== parent);

	return { id: `entity${index}`, tone: "same", parent: [{ column: String(index), items: [parent] }], members: [{ column: String(index), items: members }] };
};

/**
 * Build everything code-diff needs for one pair and one selected signal:
 * the aligned rows, the resolved lanes (connections), and the two columns.
 */
export const buildBoard = (pair, signal) => {
	const { rows } = diffLines(spanOf(pair.left), spanOf(pair.right));
	const flat = flatten(rows);
	const columns = ["0", "1"];
	const links = pair.links?.[signal] ?? [];
	const lanes = resolveLanes(flat, columns, links);
	const paths = pair.columns ?? [{}, {}];
	const blocks = [blockOf(pair.left, 0), blockOf(pair.right, 1)].filter(Boolean);

	return {
		rows,
		connections: lanes,
		blocks,
		columns: [columnOf(flat, lanes, 0, paths[0]?.path, pair.left?.startLine), columnOf(flat, lanes, 1, paths[1]?.path, pair.right?.startLine)],
	};
};

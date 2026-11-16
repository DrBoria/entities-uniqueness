"use strict";

// The VALUES model: the two value trees side by side, node by node.
//
// A closed set of literals (enum / union) is shown as one row per value; a deep
// initializer tree is flattened to one row per leaf path (`colors.bg`,
// `spacing[0]`, …). A renamed copy changes every key, so leaf paths are paired
// the SAME way the matcher scores them: shared keys by name, renamed objects
// POSITIONALLY — otherwise a full-match pair showed zero shared rows.

import { score } from "../../../matcher/values";
import { leavesOf, sourceText } from "./leaf-paths";

// One row per value of the union of two closed sets. `left`/`right` carry the
// value TEXT so the view can locate and paint the exact word.
const setRows = (setA, setB) => {
	const bSet = new Set(setB);
	const names = [...new Set([...setA, ...setB])];

	return names.map((value) => {
		const inA = setA.includes(value);
		const inB = bSet.has(value);

		return { name: value, left: inA ? { text: value } : null, right: inB ? { text: value } : null, shared: inA && inB, same: inA && inB };
	});
};

// Pair two objects' entries: shared keys by name; when (almost) no key is
// shared and the arity agrees, positionally — the matcher's renamed-copy rule.
const entryPairs = (a, b) => {
	const A = a.entries || {};
	const B = b.entries || {};
	const keysA = Object.keys(A);
	const keysB = Object.keys(B);
	const shared = keysA.filter((k) => Object.prototype.hasOwnProperty.call(B, k));
	if (keysA.length === keysB.length && keysA.length > 0 && shared.length * 2 < keysA.length) return keysA.map((k, i) => [k, keysB[i], A[k], B[keysB[i]]]);
	const keys = [...new Set([...keysA, ...keysB])];

	return keys.map((k) => [k, k, A[k] ?? null, B[k] ?? null]);
};

// Walk two trees together, emitting one row per leaf pair under the LEFT path
// (the display address). Each side keeps its OWN leaf path (`leftPath` /
// `rightPath`) so a renamed copy's links can anchor on the right side's own
// declaration line, not on the left side's key.
const pairLeaves = (a, b, prefix, rightPrefix, out) => {
	const leaf = (node) => node != null && typeof node === "object" && ["primitive", "opaque", "function"].includes(node.kind);
	const textOf = (node) => (node == null ? null : node.kind === "primitive" ? String(node.value) : node.kind === "function" ? "ƒ" : String(node.text));
	if (leaf(a) || leaf(b) || a == null || b == null) {
		const left = textOf(a);
		const right = textOf(b);
		out.push({ name: prefix, leftPath: prefix, rightPath: rightPrefix, left: left == null ? null : { text: left }, right: right == null ? null : { text: right }, shared: left != null && right != null, same: left != null && left === right });

		return out;
	}
	if (a.kind === "array" && b.kind === "array") {
		const len = Math.max((a.items || []).length, (b.items || []).length);
		for (let i = 0; i < len; i += 1) pairLeaves((a.items || [])[i] ?? null, (b.items || [])[i] ?? null, `${prefix}[${i}]`, `${rightPrefix}[${i}]`, out);

		return out;
	}
	if (a.kind === "object" && b.kind === "object") {
		for (const [ka, kb, va, vb] of entryPairs(a, b)) {
			pairLeaves(va, vb, prefix ? `${prefix}.${ka}` : ka, kb == null ? "" : rightPrefix ? `${rightPrefix}.${kb}` : kb, out);
		}

		return out;
	}
	// Different container kinds: each side's leaves stand alone.
	for (const l of leavesOf(a)) out.push({ name: prefix ? `${prefix}.${l.path}` : l.path, leftPath: prefix ? `${prefix}.${l.path}` : l.path, rightPath: "", left: { text: l.text }, right: null, shared: false, same: false });
	for (const l of leavesOf(b)) out.push({ name: rightPrefix ? `${rightPrefix}.${l.path}` : l.path, leftPath: "", rightPath: rightPrefix ? `${rightPrefix}.${l.path}` : l.path, left: null, right: { text: l.text }, shared: false, same: false });

	return out;
};

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const signal = score(left, right, opts);
	const setA = left.values ?? [];
	const setB = right.values ?? [];
	if (setA.length && setB.length) {
		const rows = setRows(setA, setB);

		return { form: "set", rows, sharedCount: rows.filter((r) => r.shared).length, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
	}
	const ta = left.valueTree ?? null;
	const tb = right.valueTree ?? null;
	if (ta == null || tb == null) return { form: null, rows: [], sharedCount: 0, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
	const rows = pairLeaves(ta, tb, "", "", []).map((row) => ({
		...row,
		left: row.left == null ? null : { text: sourceText(row.left.text) },
		right: row.right == null ? null : { text: sourceText(row.right.text) },
	}));

	return { form: "tree", rows, leftTree: ta, rightTree: tb, sharedCount: rows.filter((r) => r.shared).length, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
};

export { build };
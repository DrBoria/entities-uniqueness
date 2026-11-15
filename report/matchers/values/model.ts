"use strict";

// The VALUES model: the two value trees side by side, node by node.
//
// A closed set of literals (enum / union) is shown as one row per value; a deep
// initializer tree is flattened to one row per leaf path (`colors.bg`,
// `spacing[0]`, …) so the board can highlight the exact values that agree. `same`
// means the two sides hold the same value at that path.

import { score } from "../../../matcher/values";

// Flatten a value tree to leaf rows: [{ path, left, right }] is built by the
// caller pairing two trees; here we flatten ONE tree to { path, value } leaves.
const flatten = (node, prefix, out) => {
	if (node == null || typeof node !== "object") return out;
	if (node.kind === "primitive" || node.kind === "opaque") {
		out.push({ path: prefix, text: node.kind === "primitive" ? String(node.value) : String(node.text) });

		return out;
	}
	if (node.kind === "function") {
		out.push({ path: prefix, text: "ƒ" });

		return out;
	}
	if (node.kind === "array") {
		(node.items || []).forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));

		return out;
	}
	if (node.kind === "object") {
		for (const [key, value] of Object.entries(node.entries || {})) flatten(value, prefix ? `${prefix}.${key}` : key, out);

		return out;
	}

	return out;
};

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const signal = score(left, right, opts);

	// Closed value sets: one row per value in the union. `left`/`right` carry the
	// value TEXT (the literal as written) when that side has the member, so the
	// view can locate and paint the exact word — a boolean would leave the link
	// with nothing to anchor on and no ribbon would be drawn.
	const setA = left.values ?? [];
	const setB = right.values ?? [];
	if (setA.length && setB.length) {
		const bSet = new Set(setB);
		const names = [...new Set([...setA, ...setB])];
		const rows = names.map((value) => {
			const inA = setA.includes(value);
			const inB = bSet.has(value);
			return { name: value, left: inA ? { text: value } : null, right: inB ? { text: value } : null, shared: inA && inB, same: inA && inB };
		});

		return { form: "set", rows, sharedCount: rows.filter((r) => r.shared).length, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
	}

	// Deep trees: one row per leaf path in the union of both trees.
	const ta = left.valueTree ?? null;
	const tb = right.valueTree ?? null;
	if (ta == null || tb == null) {
		return { form: null, rows: [], sharedCount: 0, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
	}
	const la = flatten(ta, "", []);
	const lb = flatten(tb, "", []);
	const bByPath = new Map(lb.map((leaf) => [leaf.path, leaf.text]));
	const aPaths = new Set(la.map((leaf) => leaf.path));
	const rows = [];
	for (const leaf of la) {
		const rightText = bByPath.get(leaf.path);
		const shared = rightText !== undefined;
		rows.push({ name: leaf.path, left: { text: leaf.text }, right: shared ? { text: rightText } : null, shared, same: shared && leaf.text === rightText });
	}
	for (const leaf of lb) {
		if (aPaths.has(leaf.path)) continue;
		rows.push({ name: leaf.path, left: null, right: { text: leaf.text }, shared: false, same: false });
	}

	return { form: "tree", rows, sharedCount: rows.filter((r) => r.shared).length, score: signal.score, hasEvidence: signal.hasEvidence, evidence: signal.evidence };
};

export {  build  };

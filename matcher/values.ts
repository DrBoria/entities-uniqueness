"use strict";

// VALUES match: do the two entities stand for the same VALUES?
//
// Two forms, both compared here so the report has one Values group:
//
//   * a closed SET of literals — an `enum { Pending = "pending" }` or a
//     `type X = "pending" | "paid"`. Order is irrelevant; the same set spelled
//     two ways is a full match (this is the enum↔union duplicate).
//   * a deep TREE of initializer values — `const A = {...}` vs `const B = {...}`.
//     Object key order is irrelevant, array order is relevant, functions are
//     markers whose bodies are never compared. A full-tree match under different
//     names is the "renamed copy" duplicate.
//
// Entities with neither (a bare interface, a class with no initializers) carry no
// evidence and the decision-maker redistributes the weight.

const round = (n) => Math.round(n * 1000) / 1000;
import { DEFAULT_TUNING } from "../tuning";

// ── Closed value sets (enum / literal union) ────────────────────────────────
// A closed set is a set: two sets of different sizes share the smaller one's
// members in proportion. The duplicate fast path (decision-maker.sameValueSet)
// still requires EXACT equality; this score is the graded evidence.
const setScore = (A, B) => {
	const setB = new Set(B);
	const shared = A.filter((v) => setB.has(v)).length;
	const identical = A.length === B.length && shared === A.length;
	const denom = Math.max(A.length, B.length, 1);

	return { score: identical ? 1 : round(shared / denom), identical, shared };
};

// ── Deep value trees ────────────────────────────────────────────────────────
// Compare two nodes, accumulating { matched, total } over every visited node.
// `total` counts the node plus the larger of the two sides' descendant counts,
// so a missing branch lowers the score instead of disappearing from it.
const walk = (a, b, acc) => {
	acc.total += 1;
	if (a == null || b == null) return false;
	if (a.kind !== b.kind) return false;

	if (a.kind === "primitive") {
		const same = a.value === b.value;
		if (same) acc.matched += 1;

		return same;
	}
	if (a.kind === "function") {
		// Bodies are never compared; two functions agree as markers.
		acc.matched += 1;

		return true;
	}
	if (a.kind === "opaque") {
		const same = a.text === b.text;
		if (same) acc.matched += 1;

		return same;
	}
	if (a.kind === "array") {
		const A = a.items || [];
		const B = b.items || [];
		const len = Math.max(A.length, B.length);
		let all = A.length === B.length;
		for (let i = 0; i < len; i += 1) {
			if (!walk(A[i] ?? null, B[i] ?? null, acc)) all = false;
		}
		if (all) acc.matched += 1;

		return all;
	}
	if (a.kind === "object") {
		const A = a.entries || {};
		const B = b.entries || {};
		const keysA = Object.keys(A);
		const keysB = Object.keys(B);
		const sharedKeys = keysA.filter((k) => Object.prototype.hasOwnProperty.call(B, k));
		// Key NAMES are identity, not value: a renamed copy changes every key and
		// keeps every value. When the two objects share (almost) no key names but
		// have the same arity, compare the values POSITIONALLY — the i-th value of
		// one against the i-th value of the other. Declaration order is the only
		// remaining correspondence, and a full positional match is exactly the
		// "renamed copy" the fast path decides on.
		const renamed = keysA.length === keysB.length && keysA.length > 0 && sharedKeys.length * 2 < keysA.length;
		if (renamed) {
			let all = true;
			for (let i = 0; i < keysA.length; i += 1) {
				if (!walk(A[keysA[i]], B[keysB[i]], acc)) all = false;
			}
			if (all) acc.matched += 1;

			return all;
		}
		const keys = [...new Set([...keysA, ...keysB])];
		let all = keysA.length === keysB.length;
		for (const key of keys) {
			const hasA = Object.prototype.hasOwnProperty.call(A, key);
			const hasB = Object.prototype.hasOwnProperty.call(B, key);
			if (!walk(hasA ? A[key] : null, hasB ? B[key] : null, acc)) all = false;
		}
		if (all) acc.matched += 1;

		return all;
	}

	return false;
};

// Count the nodes of one tree (the denominator floor: a partial match is scored
// against the larger shape, never against the walked intersection alone).
const countNodes = (node) => {
	if (node == null || typeof node !== "object") return 0;
	if (node.kind === "array") return 1 + (node.items || []).reduce((s: number, x) => s + countNodes(x), 0);
	if (node.kind === "object") return 1 + Object.values(node.entries || {}).reduce<number>((s, x) => s + countNodes(x), 0);

	return 1;
};

// The nodes that actually carry a comparable VALUE: a bare container (`{}`,
// `[]`) is a shape, not a value, and a function is never compared by value — so
// neither counts toward the "is this evidence" floor.
const countValueNodes = (node) => {
	if (node == null || typeof node !== "object") return 0;
	if (node.kind === "function") return 0;
	if (node.kind === "array") return (node.items || []).reduce((s, x) => s + countValueNodes(x), 0);
	if (node.kind === "object") return Object.values(node.entries || {}).reduce((s, x) => s + countValueNodes(x), 0);

	return 1;
};

const treeScore = (ta, tb) => {
	const acc = { matched: 0, total: 0 };
	const identical = walk(ta, tb, acc);
	const total = Math.max(acc.total, countNodes(ta), countNodes(tb), 1);

	return { score: identical ? 1 : round(acc.matched / total), identical, matched: acc.matched, total };
};

const score = (a, b, opts: any = {}) => {
	const T = { ...DEFAULT_TUNING.values, ...((opts.tuning || {}).values || {}) };
	const setA = a.values ?? [];
	const setB = b.values ?? [];
	const ta = a.valueTree ?? null;
	const tb = b.valueTree ?? null;

	// A closed set of literals on both sides: the set decides.
	if (setA.length && setB.length) {
		const s = setScore(setA, setB);

		return { score: s.score, hasEvidence: true, evidence: { form: "set", identical: s.identical, aCount: setA.length, bCount: setB.length, matched: s.shared, total: Math.max(setA.length, setB.length) } };
	}

	// Deep initializer trees on both sides: the tree decides. A tree with too few
	// value nodes (a lone `{}` or scalar) is not discriminating evidence.
	if (ta != null && tb != null) {
		const t = treeScore(ta, tb);
		const valueNodes = Math.max(countValueNodes(ta), countValueNodes(tb));
		if (valueNodes < T.minTreeNodes) return { score: 0, hasEvidence: false, evidence: { form: "tree", identical: false, matched: 0, total: t.total } };

		return { score: t.score, hasEvidence: true, evidence: { form: "tree", identical: t.identical, matched: t.matched, total: t.total } };
	}

	return { score: 0, hasEvidence: false, evidence: { form: null, identical: false, matched: 0, total: 0 } };
};

export {  score, countNodes, treeScore, setScore  };

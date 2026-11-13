"use strict";

// The METHODS model: the two behaviour sets side by side, by method name.
//
// A method present on both sides is a shared row; the SIGNATURE signal decides
// whether the parameters/return type also agree. Here we only align names, the
// way the properties model aligns property names.

const { score } = require("../../../matcher/methods");

const byName = (methods) => {
	const map = new Map();
	for (const m of methods ?? []) if (m && m.name && m.name !== "new" && m.name !== "call") map.set(m.name, m);

	return map;
};

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const A = byName(left.methods);
	const B = byName(right.methods);
	const names = [...new Set([...A.keys(), ...B.keys()])];
	const rows = names.map((name) => {
		const a = A.get(name) ?? null;
		const b = B.get(name) ?? null;
		const shared = a !== null && b !== null;

		return {
			name,
			left: a ? { name, params: a.params ?? [], returnType: a.returnType ?? "" } : null,
			right: b ? { name, params: b.params ?? [], returnType: b.returnType ?? "" } : null,
			shared,
			same: shared,
		};
	});
	const signal = score(left, right, opts);

	return {
		rows,
		sharedCount: rows.filter((r) => r.shared).length,
		leftCount: A.size,
		rightCount: B.size,
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

module.exports = { build };

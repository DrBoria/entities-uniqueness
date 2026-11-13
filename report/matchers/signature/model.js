"use strict";

// The SIGNATURE model: for methods the two entities share by name, do the
// parameter lists and return types agree? One row per shared method, `same`
// when the canonical signature key matches.

const { score, sigKey } = require("../../../matcher/signature");

const byName = (methods) => {
	const map = new Map();
	for (const m of methods ?? []) if (m && m.name) map.set(m.name, m);

	return map;
};

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const A = byName(left.methods);
	const B = byName(right.methods);
	const rows = [];
	for (const [name, a] of A) {
		const b = B.get(name);
		if (!b) continue;
		const ka = sigKey(a);
		const kb = sigKey(b);
		rows.push({
			name,
			left: { key: ka, params: a.params ?? [], returnType: a.returnType ?? "" },
			right: { key: kb, params: b.params ?? [], returnType: b.returnType ?? "" },
			same: ka === kb,
		});
	}
	const signal = score(left, right, opts);

	return {
		rows,
		sharedCount: rows.length,
		matchingCount: rows.filter((r) => r.same).length,
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

module.exports = { build };

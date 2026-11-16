"use strict";

// The METHODS model: the two behaviour sets side by side, by method name.
//
// A method present on both sides is a shared row; the SIGNATURE signal decides
// whether the parameters/return type also agree. Names are aligned the way the
// properties model aligns property names — and a one-letter rename is graded,
// not dropped: `fetchTicket` ↔ `fetchTirket` is a shared row at its similarity,
// so the Methods tab paints the correspondence instead of reading 0%.

import { score, pairMethods } from "../../../matcher/methods";

const byName = (methods) => {
	const map = new Map();
	for (const m of methods ?? []) if (m && m.name && m.name !== "new" && m.name !== "call") map.set(m.name, m);

	return map;
};

const sideOf = (m, name) => (m ? { name, params: m.params ?? [], returnType: m.returnType ?? "", ...(m.line ? { line: m.line } : {}) } : null);

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const A = byName(left.methods);
	const B = byName(right.methods);
	// One-to-one correspondence: exact names first, then near misses (the same
	// pairing the score uses, so the rows and the number never disagree).
	const pairs = pairMethods(new Set(A.keys()), new Set(B.keys()));
	const pairedLeft = new Set(pairs.map((p) => p.left));
	const pairedRight = new Set(pairs.map((p) => p.right));
	const rows = pairs.map((p) => {
		const a = A.get(p.left);
		const b = B.get(p.right);

		return {
			name: p.left,
			left: sideOf(a, p.left),
			right: sideOf(b, p.right),
			shared: true,
			same: p.exact,
			sim: p.sim,
			...(p.exact ? {} : { renamed: p.right }),
		};
	});
	// Surplus methods (no counterpart) stand alone, one row per name.
	for (const [name, m] of A) if (!pairedLeft.has(name)) rows.push({ name, left: sideOf(m, name), right: null, shared: false, same: false, sim: 0 });
	for (const [name, m] of B) if (!pairedRight.has(name)) rows.push({ name, left: null, right: sideOf(m, name), shared: false, same: false, sim: 0 });
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

export {  build  };

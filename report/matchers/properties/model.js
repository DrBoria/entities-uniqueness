"use strict";

// The PROPERTIES model: the two shapes side by side, member by member.
//
// Entities carry flat `properties: [{name, type, …}]` lists — no parser columns,
// no body tree. The model aligns them by NAME: a name present on both sides is a
// shared row (and `same` when the canonical type agrees too), a name on one side
// only is a surplus row. This is the whole comparison material the board draws.

const { score } = require("../../../matcher/properties");

const byName = (props) => {
	const map = new Map();
	for (const p of props ?? []) if (p && p.name) map.set(p.name, p);

	return map;
};

// One row per property name in the union, in A-then-B order. `same` means the
// name is shared AND its type agrees; a shared name with a differing type is a
// `differs` row (the shape matches, the type does not).
const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const A = byName(left.properties);
	const B = byName(right.properties);
	const names = [...new Set([...A.keys(), ...B.keys()])];
	const rows = names.map((name) => {
		const a = A.get(name) ?? null;
		const b = B.get(name) ?? null;
		const shared = a !== null && b !== null;
		const sameType = shared && (a.type ?? "") === (b.type ?? "");

		return {
			name,
			left: a ? { name, type: a.type ?? "", readonly: !!a.readonly, optional: !!a.optional } : null,
			right: b ? { name, type: b.type ?? "", readonly: !!b.readonly, optional: !!b.optional } : null,
			shared,
			same: shared && sameType,
		};
	});
	const shared = rows.filter((r) => r.shared);
	const agreed = shared.filter((r) => r.same);
	const signal = score(left, right, opts);

	return {
		rows,
		sharedCount: shared.length,
		agreedCount: agreed.length,
		leftCount: A.size,
		rightCount: B.size,
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

module.exports = { build };

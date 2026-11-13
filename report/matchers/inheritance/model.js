"use strict";

// The INHERITANCE model: the two heritage sets (extends ∪ implements) and the
// bases they share. `extends` may be a single string or an array; normalize both
// to a list so a single base is not spread into characters.

const { score } = require("../../../matcher/inheritance");

const listOf = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

const heritage = (entity) => [...new Set([...listOf(entity.extends), ...listOf(entity.implements)])];

const build = (left, right) => {
	if (!left || !right) return null;
	const signal = score(left, right);
	const A = heritage(left);
	const B = heritage(right);
	const bSet = new Set(B);
	const names = [...new Set([...A, ...B])];
	const rows = names.map((name) => ({ name, left: A.includes(name), right: bSet.has(name), shared: A.includes(name) && bSet.has(name) }));

	return {
		rows,
		left: A,
		right: B,
		shared: A.filter((x) => bSet.has(x)),
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

module.exports = { build };

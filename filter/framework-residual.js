"use strict";

// framework-residual — two entities of the *same* framework with very little
// non-framework "meat" (few properties/methods) are likely just framework
// boilerplate that happens to look alike, not a real duplication.
//
// The threshold is a named constant; the check is on combined member count so
// a 2-property zod schema paired with another 2-property zod schema is dropped
// while a 10-property pair is kept.

const { DEFAULT_TUNING } = require("../tuning");

const meat = (e) => (e.properties?.length || 0) + (e.methods?.length || 0);

// Factory: bind the tuning (threshold) at config time so the filter registry
// shape { name, test(match) } stays unchanged.
const makeTest = (tuning) => {
	const minMeat = tuning?.frameworkResidualMinMeat ?? DEFAULT_TUNING.filters.frameworkResidualMinMeat;

	return (match) => {
		const a = match.a;
		const b = match.b;
		if (!a || !b) return null;
		if (!a.framework || a.framework !== b.framework) return null;
		if (meat(a) + meat(b) < minMeat) return `framework-residual: ${a.framework} entities with ${meat(a) + meat(b)} members`;

		return null;
	};
};

module.exports = { name: "framework-residual", makeTest };

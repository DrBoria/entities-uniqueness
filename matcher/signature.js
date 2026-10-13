"use strict";

// Signature match: for methods the two entities share by name, how many also
// agree on canonical parameter + return types.
//
// This rewards "same shape" over "same name" — two entities sharing a method
// `save(id: string): Promise<void>` score higher than sharing `save()` with
// different signatures.

const { DEFAULT_TUNING } = require("../tuning");

const sigKey = (m) => `${m.name}(${(m.params || []).join(",")}):${m.returnType || "void"}`;

// With a single shared method the ratio is binary (0 or 1) and reads as a
// perfect 1.00 even when the two entities are otherwise unrelated — e.g. two
// things that both happen to have a trivial `dispose()`. That is a weak
// "same signature" estimate, so discount it the same way the properties matcher
// discounts small shapes (see tuning.signature.singleMethodDiscount).

const score = (a, b, opts = {}) => {
	const T = { ...DEFAULT_TUNING.signature, ...(opts.tuning || {}) };
	const amap = new Map((a.methods || []).map((m) => [m.name, sigKey(m)]));
	const bmap = new Map((b.methods || []).map((m) => [m.name, sigKey(m)]));
	let shared = 0;
	let match = 0;
	for (const [name, key] of amap) {
		if (bmap.has(name)) {
			shared += 1;
			if (key === bmap.get(name)) match += 1;
		}
	}
	// No shared methods -> the signal carries no evidence for the pair: it scores 0
	// (not a neutral 1.0) and the decision-maker redistributes its weight.
	if (shared === 0) {
		return { score: 0, hasEvidence: false, evidence: { shared: 0, matching: 0 } };
	}

	let value = match / shared;
	if (shared === 1 && value > 0) value *= 1 - T.singleMethodDiscount;

	return { score: value, hasEvidence: true, evidence: { shared, matching: match, singleMethod: shared === 1 } };
};

module.exports = { score, sigKey };

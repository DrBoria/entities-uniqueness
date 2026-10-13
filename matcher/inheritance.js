"use strict";

// Inheritance overlap: do the two entities share a common base (extends) or
// implement the same interfaces?
//
// A high score means "both extend Base / both implement IThing" — a signal they
// may be siblings that could share a common ancestor. Neutral (1) when neither
// entity declares any heritage, so absence of inheritance is not a penalty.

const heritageSet = (e) => new Set([...(e.extends || []), ...(e.implements || [])]);

const jaccard = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;
	const uni = a.size + b.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const score = (a, b) => {
	const A = heritageSet(a);
	const B = heritageSet(b);
	const shared = [...A].filter((x) => B.has(x));
	const hasEvidence = A.size > 0 || B.size > 0;
	// No evidence when neither entity declares any heritage — scores 0 (not a neutral
	// 1.0) and the decision-maker redistributes the weight.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { aHeritage: [], bHeritage: [], shared: [] } };
	}

	return { score: jaccard(A, B), hasEvidence, evidence: { aHeritage: [...A], bHeritage: [...B], shared } };
};

module.exports = { score };

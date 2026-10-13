"use strict";

// Jaccard + overlap over method names.
//
// Method *names* drive the score; whether shared methods agree on signature is
// a separate signal (see ./signature.js). `ignoredMembers` is config-supplied.

const { DEFAULT_TUNING } = require("../tuning");

const nameSet = (methods, ignored) => new Set((methods || []).map((m) => m.name).filter((n) => n && n !== "new" && n !== "call" && !ignored.has(n)));

const jaccard = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;
	const uni = a.size + b.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const overlap = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	const min = Math.min(a.size, b.size);
	if (min === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;

	return inter / min;
};

const round = (n) => Math.round(n * 1000) / 1000;

const score = (a, b, opts = {}) => {
	const T = { ...DEFAULT_TUNING.methods, ...(opts.tuning || {}) };
	const ignored = new Set(opts.ignoredMembers || []);
	const A = nameSet(a.methods, ignored);
	const B = nameSet(b.methods, ignored);
	const hasEvidence = A.size > 0 || B.size > 0;
	// No evidence when neither entity declares any methods — scores 0 (not a neutral
	// 1.0) and the decision-maker redistributes the weight.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { jaccard: 0, overlap: 0, aCount: 0, bCount: 0 } };
	}
	const j = jaccard(A, B);
	const o = overlap(A, B);
	const value = T.jaccardWeight * j + T.overlapWeight * o;

	return { score: value, hasEvidence, evidence: { jaccard: round(j), overlap: round(o), aCount: A.size, bCount: B.size } };
};

module.exports = { score };

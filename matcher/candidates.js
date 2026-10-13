"use strict";

// The matcher's raw output: for every entity pair it emits a *candidate* of one
// of two kinds, carrying only raw geometry (no scoring, no tier):
//
//   subset       — one shape is fully contained in the other (B ⊆ A, |A| > |B|).
//                  The decision-maker later names the larger one `parent` and the
//                  smaller one `child`.
//   intersection — comparable sizes (|A| ≈ |B|) with a large shared core
//                  (|A ∩ B| big relative to the smaller shape).
//
// rawMetrics is always { jaccard, overlap, sizeDiff } so a downstream decision is
// explainable from the geometry alone.

const { DEFAULT_TUNING } = require("../tuning");

const nameSet = (props, ignored) => new Set((props || []).map((p) => p.name).filter((n) => n && !ignored.has(n)));

const round = (n) => Math.round(n * 1000) / 1000;

const rawMetrics = (A, B) => {
	let inter = 0;
	for (const x of A) if (B.has(x)) inter += 1;
	const union = A.size + B.size - inter;
	const jaccard = union === 0 ? 0 : inter / union;
	const min = Math.min(A.size, B.size);
	const overlap = min === 0 ? 0 : inter / min;

	return { jaccard: round(jaccard), overlap: round(overlap), sizeDiff: Math.abs(A.size - B.size), inter, union };
};

// True when `small` is a strict subset of `big` (every name present, and smaller).
const isSubset = (small, big) => {
	if (small.size === 0 || small.size >= big.size) return false;
	for (const x of small) if (!big.has(x)) return false;

	return true;
};

const findCandidates = (entities, opts = {}) => {
	const T = { ...DEFAULT_TUNING.candidates, ...((opts.tuning || {}).candidates || {}) };
	const ignored = new Set(opts.ignoredMembers || []);
	const out = [];
	for (let i = 0; i < entities.length; i += 1) {
		for (let j = i + 1; j < entities.length; j += 1) {
			const a = entities[i];
			const b = entities[j];
			if (a.sourceFile === b.sourceFile && a.name === b.name) continue;
			const A = nameSet(a.properties, ignored);
			const B = nameSet(b.properties, ignored);
			const m = rawMetrics(A, B);
			// subset: one shape fully contained in the other (strictly smaller side
			// must still carry at least subsetMinFields names to count as a shape).
			if (isSubset(A, B) && A.size >= T.subsetMinFields) {
				out.push({ a, b, kind: "subset", rawMetrics: m });
				continue;
			}
			if (isSubset(B, A) && B.size >= T.subsetMinFields) {
				out.push({ a, b, kind: "subset", rawMetrics: m });
				continue;
			}
			// intersection: comparable sizes with a large shared core.
			if (m.sizeDiff <= T.intersectionMaxSizeDiff && m.overlap >= T.intersectionMinOverlap && m.inter >= T.intersectionMinShared) {
				out.push({ a, b, kind: "intersection", rawMetrics: m });
			}
		}
	}

	return out;
};

module.exports = { findCandidates };

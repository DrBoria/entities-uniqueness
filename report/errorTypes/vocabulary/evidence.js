"use strict";

// The READER's names for the matchers' evidence keys.
//
// The matchers emit numbers under machine-ish keys (`jaccard`, `typeAgreement`)
// because they are diagnostics, not prose. A person reading a finding needs the
// QUESTION the number answers, so the translation lives here with the rest of
// the wording — not in the decision engine, which only decides.
//
// A key that is missing here falls back to its own name, so a new matcher
// evidence field shows up (ugly but visible) instead of disappearing.

const EVIDENCE_LABELS = Object.freeze({
	// properties
	jaccard: "name overlap (Jaccard)",
	overlap: "name overlap (shared / smaller)",
	typeAgreement: "shared types that agree",
	genericShare: "generic-typed share",
	aCount: "properties (A)",
	bCount: "properties (B)",
	aTotal: "properties before filter (A)",
	bTotal: "properties before filter (B)",
	inter: "properties in common",
	union: "properties in total",
	brandsDiffer: "brand types differ",
	// methods / signature
	shared: "in common",
	matching: "matching signatures",
	singleMethod: "single method",
	// name
	levenshtein: "name edit distance",
	tokens: "name token overlap",
	aTokens: "name tokens (A)",
	bTokens: "name tokens (B)",
	// inheritance
	aHeritage: "bases (A)",
	bHeritage: "bases (B)",
});

const labelOfEvidence = (key) => EVIDENCE_LABELS[key] ?? key;

module.exports = { EVIDENCE_LABELS, labelOfEvidence };

"use strict";

// Name similarity: blends normalized Levenshtein distance with token overlap.
//
// No hardcoded word lists. `User` vs `UserModel` -> high (token overlap +
// short edit distance); `User` vs `Order` -> low. Tokenization splits on
// camelCase / snake_case / punctuation so `user_profile` and `UserProfile`
// compare on the same tokens.

const { DEFAULT_TUNING } = require("../tuning");

const tokenize = (name) => {
	const s = String(name || "")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_\-./\s]+/g, " ")
		.trim()
		.toLowerCase();
	const parts = s.split(/\s+/).filter(Boolean);

	return parts.length ? parts : [s];
};

const levenshtein = (a, b) => {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
	for (let i = 1; i <= a.length; i += 1) {
		let cur = [i];
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		prev.splice(0, prev.length, ...cur);
	}

	return prev[b.length];
};

const levSimilarity = (a, b) => {
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;

	return 1 - levenshtein(a, b) / maxLen;
};

const tokenSimilarity = (a, b) => {
	const A = new Set(tokenize(a));
	const B = new Set(tokenize(b));
	if (A.size === 0 && B.size === 0) return 1;
	if (A.size === 0 || B.size === 0) return 0;
	let inter = 0;
	for (const x of A) if (B.has(x)) inter += 1;
	const uni = A.size + B.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const round = (n) => Math.round(n * 1000) / 1000;

const score = (a, b, opts = {}) => {
	const T = { ...DEFAULT_TUNING.name, ...(opts.tuning || {}) };
	const an = String(a.name || "");
	const bn = String(b.name || "");
	const hasEvidence = an.length > 0 || bn.length > 0;
	// No evidence when neither entity has a name — scores 0 rather than a neutral 1.0.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { levenshtein: 0, tokens: 0, aTokens: [], bTokens: [] } };
	}
	const l = levSimilarity(an.toLowerCase(), bn.toLowerCase());
	const t = tokenSimilarity(an, bn);
	const value = T.levenshteinWeight * l + T.tokenWeight * t;

	return { score: value, hasEvidence, evidence: { levenshtein: round(l), tokens: round(t), aTokens: tokenize(an), bTokens: tokenize(bn) } };
};

module.exports = { score, tokenize, levenshtein };

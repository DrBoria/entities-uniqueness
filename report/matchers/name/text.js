"use strict";

// The NAME CLI text: the two names, the shared tokens, and the edit-distance /
// token-overlap evidence.

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const lines = [`${pct(model.score)}  ${model.left.name} ↔ ${model.right.name}`];
	if (model.common.length > 0) lines.push(`shared tokens  ${model.common.join(", ")}`);
	const ev = model.evidence ?? {};
	lines.push(`edit distance ${ev.levenshtein ?? 0}  ·  token overlap ${ev.tokens ?? 0}`);

	return lines;
};

module.exports = { text };

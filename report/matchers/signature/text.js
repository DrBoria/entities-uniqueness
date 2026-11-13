"use strict";

// The SIGNATURE CLI text: how many shared methods agree on their full signature,
// then each shared method with `≡` (same) or `≠` (different params/return).

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const head = `${pct(model.score)}  ${model.matchingCount}/${model.sharedCount} shared method(s) match in signature`;
	const lines = [head];
	for (const row of model.rows) {
		lines.push(`${row.same ? "≡" : "≠"} ${row.left.key}  ↔  ${row.right.key}`);
	}

	return lines;
};

module.exports = { text };

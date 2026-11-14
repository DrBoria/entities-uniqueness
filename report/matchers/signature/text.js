"use strict";

// The SIGNATURE CLI text: the entity-name agreement, then how many shared methods
// agree on their full signature, then each shared method with `≡` (same) or `≠`
// (different params/return).

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const lines = [];
	if (model.name) {
		const common = model.name.common?.length ? ` (${model.name.common.join(" + ")})` : "";
		lines.push(`name ${pct(model.name.score)}  ${model.name.left.name} ↔ ${model.name.right.name}${common}`);
	}
	if (model.sharedCount > 0) {
		lines.push(`${pct(model.score)}  ${model.matchingCount}/${model.sharedCount} shared method(s) match in signature`);
		for (const row of model.rows) {
			lines.push(`${row.same ? "≡" : "≠"} ${row.left.key}  ↔  ${row.right.key}`);
		}
	}

	return lines;
};

module.exports = { text };

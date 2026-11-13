"use strict";

// The INHERITANCE CLI text: the shared bases, then each side's full heritage.

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const lines = [`${pct(model.score)}  ${model.shared.length} shared base(s)`];
	if (model.shared.length > 0) lines.push(`shared  ${model.shared.join(", ")}`);
	if (model.left.length > 0) lines.push(`A  ${model.left.join(", ")}`);
	if (model.right.length > 0) lines.push(`B  ${model.right.join(", ")}`);

	return lines;
};

module.exports = { text };

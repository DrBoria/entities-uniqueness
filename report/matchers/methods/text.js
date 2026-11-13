"use strict";

// The METHODS CLI text: the score, the shared method names, then the names only
// one side carries.

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const shared = model.rows.filter((r) => r.shared).map((r) => r.name);
	const head = `${pct(model.score)}  ${shared.length} shared method(s)  (${model.leftCount}↔${model.rightCount})`;
	const lines = [head];
	if (shared.length > 0) lines.push(`shared  ${shared.join(", ")}`);
	const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
	const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
	if (onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
	if (onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

	return lines;
};

module.exports = { text };

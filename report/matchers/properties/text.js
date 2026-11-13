"use strict";

// The PROPERTIES CLI text: the score, then the shared names (with a `≠` when the
// type differs), then the names only one side carries.

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const shared = model.rows.filter((r) => r.shared);
	const agreed = shared.filter((r) => r.same);
	const head = `${pct(model.score)}  ${agreed.length}/${shared.length} shared agree in type  (${model.leftCount}↔${model.rightCount} properties)`;
	const lines = [head];
	const differing = shared.filter((r) => !r.same).map((r) => `${r.name}: ${r.left.type} ≠ ${r.right.type}`);
	if (differing.length > 0) lines.push(`type differs  ${differing.join("  ·  ")}`);
	const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
	const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
	if (onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
	if (onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

	return lines;
};

module.exports = { text };

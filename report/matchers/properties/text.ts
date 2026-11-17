"use strict";

// The PROPERTIES CLI text: the score, then WHAT is shared — every agreed
// property as `name: type`, comma-separated (the same facts the Properties tab
// paints), then the type conflicts and the one-sided names.

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const shared = model.rows.filter((r) => r.shared);
	const agreed = shared.filter((r) => r.same);
	const head = `${pct(model.score)}  ${agreed.length}/${shared.length} shared agree in type  (${model.leftCount}↔${model.rightCount} properties)`;
	const lines = [head];
	if (agreed.length > 0) lines.push(`shared  ${agreed.map((r) => `${r.name}: ${r.left.type || "?"}`).join(", ")}`);
	const differing = shared.filter((r) => !r.same).map((r) => `${r.name}: ${r.left.type} ≠ ${r.right.type}`);
	if (differing.length > 0) lines.push(`type differs  ${differing.join(", ")}`);
	const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
	const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
	if (onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
	if (onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

	return lines;
};

export {  text  };

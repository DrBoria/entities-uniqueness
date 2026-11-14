"use strict";

// The VALUES CLI text: how much of the value tree agrees, then the leaves that
// differ (a renamed copy has none; two configs that share a shape list theirs).

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const lines = [];
	if (model.form === "set") {
		lines.push(`${pct(model.score)}  ${model.sharedCount} shared value(s)`);
		for (const row of model.rows) lines.push(`${row.same ? "≡" : "·"} ${row.name}`);

		return lines;
	}
	if (model.form === "tree") {
		const differing = model.rows.filter((r) => r.shared && !r.same);
		lines.push(`${pct(model.score)}  ${model.sharedCount} value path(s) compared${model.evidence.identical ? " — identical" : ""}`);
		for (const row of differing.slice(0, 12)) lines.push(`≠ ${row.name}: ${row.left.text} ↔ ${row.right.text}`);
		if (differing.length > 12) lines.push(`…and ${differing.length - 12} more differing path(s)`);

		return lines;
	}

	return lines;
};

export {  text  };
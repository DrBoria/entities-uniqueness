"use strict";

// The VALUES CLI text: how much of the value tree agrees, then the leaves that
// differ (a renamed copy has none; two configs that share a shape list theirs).

const pct = (n) => `${Math.round(n * 100)}%`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const lines = [];
	if (model.form === "set") {
		const shared = model.rows.filter((r) => r.shared);
		lines.push(`${pct(model.score)}  ${model.sharedCount} shared value(s)`);
		if (shared.length > 0) lines.push(`shared  ${shared.map((r) => r.name).join(", ")}`);
		const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
		const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
		if (onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
		if (onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

		return lines;
	}
	if (model.form === "tree") {
		const agreed = model.rows.filter((r) => r.shared && r.same);
		const differing = model.rows.filter((r) => r.shared && !r.same);
		lines.push(`${pct(model.score)}  ${model.sharedCount} value path(s) compared${model.evidence.identical ? " — identical" : ""}`);
		// WHAT is shared: every agreeing leaf as `path = value`, comma-separated —
		// the same leaves the Values tab paints. A renamed copy reads as its data.
		if (agreed.length > 0) {
			const shown = agreed.slice(0, 16).map((r) => `${r.name} = ${r.left.text}`);
			if (agreed.length > 16) shown.push(`…+${agreed.length - 16} more`);
			lines.push(`shared  ${shown.join(", ")}`);
		}
		for (const row of differing.slice(0, 12)) lines.push(`≠ ${row.name}: ${row.left.text} ↔ ${row.right.text}`);
		if (differing.length > 12) lines.push(`…and ${differing.length - 12} more differing path(s)`);
		const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
		const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
		if (onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
		if (onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

		return lines;
	}

	return lines;
};

export {  text  };

"use strict";

// The METHODS CLI text: the score, then WHAT is shared — every shared method
// with its signature (params → return), comma-separated, then the one-sided
// names. The same facts the Methods tab paints.

const pct = (n) => `${Math.round(n * 100)}%`;

const sig = (m) => `${m.name}(${(m.params ?? []).join(", ")})${m.returnType ? `: ${m.returnType}` : ""}`;

const text = (model) => {
	if (!model || !model.hasEvidence) return [];
	const shared = model.rows.filter((r) => r.shared);
	const head = `${pct(model.score)}  ${shared.length} shared method(s)  (${model.leftCount}↔${model.rightCount})`;
	const lines = [head];
	if (shared.length > 0) lines.push(`shared  ${shared.map((r) => (sig(r.left) === sig(r.right) ? sig(r.left) : `${sig(r.left)} ↔ ${sig(r.right)}`)).join(", ")}`);
	// A uniform ceremony prefix (`internalRepositoryFetchCustomer ≡ fetchCustomer`)
	// is a recognized rename: name the pairs, so the score is explainable.
	const prefix = model.evidence?.sharedPrefix;
	if (prefix) {
		const aNames = model.rows.filter((r) => r.left).map((r) => r.name);
		const bNames = model.rows.filter((r) => r.right).map((r) => r.name);
		const pairs = [];
		for (const a of aNames) {
			const b = bNames.find((n) => n.startsWith(prefix) && n.slice(prefix.length).toLowerCase() === a.toLowerCase());
			if (b) pairs.push(`${a} ↔ ${b}`);
		}
		for (const b of bNames) {
			const a = aNames.find((n) => n.startsWith(prefix) && n.slice(prefix.length).toLowerCase() === b.toLowerCase());
			if (a && !pairs.some((p) => p.includes(a))) pairs.push(`${a} ↔ ${b}`);
		}
		if (pairs.length > 0) lines.push(`prefix "${prefix}"  ${pairs.join(", ")}`);
	}
	const onlyA = model.rows.filter((r) => r.left && !r.right).map((r) => r.name);
	const onlyB = model.rows.filter((r) => r.right && !r.left).map((r) => r.name);
	if (!prefix && onlyA.length > 0) lines.push(`only A  ${onlyA.join(", ")}`);
	if (!prefix && onlyB.length > 0) lines.push(`only B  ${onlyB.join(", ")}`);

	return lines;
};

export {  text  };

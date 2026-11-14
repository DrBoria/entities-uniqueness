"use strict";

// The SIGNATURE model: the entity NAME plus, for methods the two entities share
// by name, whether the parameter lists and return types agree. A name is part of
// a signature, so the entity names are the first row here (there is no separate
// Name group). One row per shared method, `same` when the canonical signature key
// matches.

import { score, sigKey } from "../../../matcher/signature";
import { score as nameScore, tokenize } from "../../../matcher/name";

const byName = (methods) => {
	const map = new Map();
	for (const m of methods ?? []) if (m && m.name) map.set(m.name, m);

	return map;
};

const build = (left, right, opts = {}) => {
	if (!left || !right) return null;
	const A = byName(left.methods);
	const B = byName(right.methods);
	const rows = [];
	for (const [name, a] of A) {
		const b = B.get(name);
		if (!b) continue;
		const ka = sigKey(a);
		const kb = sigKey(b);
		rows.push({
			name,
			left: { key: ka, params: a.params ?? [], returnType: a.returnType ?? "", ...(a.line ? { line: a.line } : {}) },
			right: { key: kb, params: b.params ?? [], returnType: b.returnType ?? "", ...(b.line ? { line: b.line } : {}) },
			same: ka === kb,
		});
	}
	const signal = score(left, right, opts);

	// The entity-name comparison (tokens + edit distance) lives inside Signature.
	const name = nameScore(left, right, opts);
	const aTokens = tokenize(left.name ?? "");
	const bTokens = tokenize(right.name ?? "");
	const bSet = new Set(bTokens);
	const nameModel = {
		left: { name: left.name ?? "", tokens: aTokens },
		right: { name: right.name ?? "", tokens: bTokens },
		common: aTokens.filter((t) => bSet.has(t)),
		score: name.score,
		hasEvidence: name.hasEvidence,
		evidence: name.evidence,
	};

	return {
		rows,
		sharedCount: rows.length,
		matchingCount: rows.filter((r) => r.same).length,
		name: nameModel,
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

export {  build  };

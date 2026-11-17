"use strict";

// The SIGNATURE model: the entity NAME plus, for methods the two entities
// CORRESPOND on (exact name or near-miss rename — the same pairing the methods
// matcher uses), whether the parameter TYPES and return types agree. A name is
// part of a signature, so the entity names are the first row here (there is no
// separate Name group). One row per corresponding method, `same` when the
// canonical shape key matches.

import { score, sigKey, shapesAgree } from "../../../matcher/signature";
import { pairMethods } from "../../../matcher/method-pairs";
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
	const pairs = pairMethods(new Set(A.keys()), new Set(B.keys()));
	const rows = pairs.map((p) => {
		const a = A.get(p.left);
		const b = B.get(p.right);
		const ka = sigKey(a);
		const kb = sigKey(b);

		return {
			name: p.left,
			left: { key: ka, params: a.params ?? [], paramTypes: a.paramTypes ?? [], returnType: a.returnType ?? "", ...(a.line ? { line: a.line } : {}) },
			right: { key: kb, params: b.params ?? [], paramTypes: b.paramTypes ?? [], returnType: b.returnType ?? "", ...(b.line ? { line: b.line } : {}) },
			same: shapesAgree(a, b),
			sim: p.sim,
			...(p.exact ? {} : { renamed: p.right }),
		};
	});
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

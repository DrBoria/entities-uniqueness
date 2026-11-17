"use strict";

// Inheritance overlap: do the two entities share a common base (extends) or
// implement the same interfaces — or is one an ALIAS of the other?
//
// A high score means "both extend Base / both implement IThing" — a signal they
// may be siblings that could share a common ancestor. A `type X = Y` alias is the
// strongest heritage fact there is: X carries no shape of its own, it IS Y. That
// is reuse, not duplication, and the decision-maker reads `alias` to say so.
// Neutral (no evidence) when neither entity declares any heritage or alias.
//
// With an entity index (opts.entities) the heritage sets are the TRANSITIVE
// closure: a grandchild of Base and a child of Base share Base even though
// their direct `extends` differ (see ./heritage.js).

import { effectiveHeritage } from "./heritage";

const listOf = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

const heritageSet = (e) => new Set([...listOf(e.extends), ...listOf(e.implements)]);

// The alias fact, oriented: which side is the alias and which is the target.
// `type X = Y` inside the scanned set means X.aliasOf === Y.name.
const aliasFact = (a, b) => {
	if (a.aliasOf && a.aliasOf === b.name) return { alias: a, target: b };
	if (b.aliasOf && b.aliasOf === a.name) return { alias: b, target: a };

	return null;
};

const jaccard = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;
	const uni = a.size + b.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const score = (a, b, opts: any = {}) => {
	// With the project's entities, compare the TRANSITIVE heritage closure;
	// without it, the direct sets (the pair-only call still works).
	const effective = opts.entities ? effectiveHeritage(a, b, opts.entities) : null;
	const A = effective ? effective.A : heritageSet(a);
	const B = effective ? effective.B : heritageSet(b);
	const shared = [...A].filter((x) => B.has(x));
	const alias = aliasFact(a, b);
	const hasEvidence = A.size > 0 || B.size > 0 || alias !== null;
	// No evidence when neither entity declares any heritage — scores 0 (not a neutral
	// 1.0) and the decision-maker redistributes the weight.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { aHeritage: [], bHeritage: [], shared: [], alias: null } };
	}

	// An alias is full heritage agreement: the alias stands for the target itself.
	const value = alias ? 1 : jaccard(A, B);

	return {
		score: value,
		hasEvidence,
		evidence: {
			aHeritage: [...A],
			bHeritage: [...B],
			shared,
			alias: alias ? { alias: alias.alias.name, target: alias.target.name } : null,
		},
	};
};

export {  score, aliasFact  };

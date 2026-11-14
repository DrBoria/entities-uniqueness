"use strict";

// Combines the signals into a single confidence (0..1) and a tier.
//
// Default weights:
//   confidence = 0.25*properties + 0.30*methods + 0.20*signature
//              + 0.15*name + 0.10*inheritance
// `name` is not a verdict of its own — it is the always-on part of the SIGNATURE
// verdict (a name is part of a signature); the report shows it inside Signature.
// `values` (deep value comparison) carries weight 0 by default: when it has
// evidence it DECIDES the pair on its own (values are the strongest identity
// fact), and the structural signals stand down.
//
// Tiers:
//   duplicate : confidence >= duplicate threshold (default 0.85)
//   extract   : confidence >= extract threshold   (default 0.50)
//   similar   : confidence >= similar threshold   (default 0.35)
//   alias     : one entity is an alias of the other — reuse, NOT duplication
//   (none)    : below similar — not reported as a candidate
//
// `reason` always lists every signal's contribution so a score is explainable.

import { DEFAULT_TUNING } from "./tuning";
import { score as propertyScore } from "./matcher/properties.js";

const DEFAULT_WEIGHTS = DEFAULT_TUNING.weights;
const DEFAULT_THRESHOLDS = DEFAULT_TUNING.thresholds;

// The identity signals (structure of the entity) share a fixed budget of
// `1 - name_weight` and are re-normalized over whichever of them carry evidence
// for a given pair. `name` is a separate, always-on bonus (names always exist)
// that is never re-normalized upward, so a weak name match cannot dominate a pair
// whose real signal is its structure.
const IDENTITY_KEYS = ["properties", "methods", "signature", "values", "inheritance"];
// When values carry evidence they are the whole structural verdict: a renamed
// copy is judged by its values, not diluted by name-only shape overlap.
const NAME_KEY = "name";

const round = (n) => Math.round(n * 1000) / 1000;

// Per-key fallback so a partial override keeps the rest of the defaults.
const resolveWeights = (override) => {
	const o = override || {};

	return {
		properties: o.properties ?? DEFAULT_WEIGHTS.properties,
		methods: o.methods ?? DEFAULT_WEIGHTS.methods,
		signature: o.signature ?? DEFAULT_WEIGHTS.signature,
		values: o.values ?? DEFAULT_WEIGHTS.values,
		name: o.name ?? DEFAULT_WEIGHTS.name,
		inheritance: o.inheritance ?? DEFAULT_WEIGHTS.inheritance,
	};
};

const resolveThresholds = (override) => {
	const o = override || {};

	return {
		duplicate: o.duplicate ?? DEFAULT_THRESHOLDS.duplicate,
		extract: o.extract ?? DEFAULT_THRESHOLDS.extract,
		similar: o.similar ?? DEFAULT_THRESHOLDS.similar,
	};
};

// An identity signal only counts toward confidence when it carries discriminating
// evidence for the pair. A signal that is empty on both sides (no methods, no
// shared methods, no heritage) is *neutral* — it neither supports nor refutes
// similarity, so its weight is redistributed across the identity signals that do
// have evidence. This is what stops two unrelated data-only types from scoring high
// just because they happen to both lack methods.
const hasEvidence = (s) => s && s.hasEvidence !== false;

// A type alias whose target is another entity in the project (`type X = Y`)
// carries no shape of its own — it IS the target. That is reuse (inheritance),
// not duplication: the pair gets the `alias` verdict, never `duplicate`.
const aliasPair = (a, b) => {
	if (a.aliasOf && a.aliasOf === b.name) return { alias: a, target: b };
	if (b.aliasOf && b.aliasOf === a.name) return { alias: b, target: a };

	return null;
};

// A hand-written type object whose shape duplicates a framework store model's
// shape (e.g. `type DocumentData = {...}` vs `t.model("DocumentStore", {...})`).
// The weighted score under-counts this because the store model has no methods
// while the type copy may declare them, dragging the methods signal to 0. When
// the type's data shape is mostly the store's shape (high overlap + type
// agreement), the pair is a duplicate regardless of the methods mismatch.
const isStoreModelCopy = (a, b) => {
	const type = a.kind === "type" ? a : b.kind === "type" ? b : null;
	const store = a.storeModel ? a : b.storeModel ? b : null;
	if (!type || !store) return null;
	// A tiny type sharing a couple of generic field names (id, name, ...) with a
	// store is not a copy of it — require a real shape to compare.
	if ((type.properties || []).length < 3) return null;
	const s = propertyScore(type, store, {});
	if (s.evidence.overlap >= 0.6 && s.evidence.typeAgreement >= 0.75) return s;

	return null;
};

// Two entities of the same kind with the exact same data shape (every property
// name and type matches, at least a couple of properties) are duplicates — the
// weighted blend under-counts this when the names differ only slightly or one
// side carries extra non-data signals.
const isIdenticalShape = (a, b, signals) => {
	if (!signals || !signals.properties || !signals.properties.evidence) return null;
	if (a.kind !== b.kind) return null;
	const ev = signals.properties.evidence;
	// Two-field shapes ({id, name}, ...) are the most common shape in any
	// codebase and are not discriminating evidence — that stays the territory
	// of the weighted blend. Only a full, multi-field identical shape is a
	// fast-path duplicate.
	if (ev.aCount < 3 || ev.bCount < 3) return null;
	if (ev.overlap < 1 || ev.typeAgreement < 1) return null;
	// Identical shape under DIFFERENT names is an extraction opportunity
	// (shared-type suggestion), not a duplicate. A copy carries a copy-like
	// name (TokenQuery / TokenQueryCopy); two domain profiles that happen to
	// converge on the same fields do not.
	const nameScore = signals.name && signals.name.score;
	if (typeof nameScore !== "number" || nameScore < 0.6) return null;

	return {
		isDuplicate: true,
		tier: "duplicate",
		confidence: 0.92,
		reason: `identical shape: ${a.name} and ${b.name} have the same properties and types`,
	};
};

// An `enum` and a literal union are the same closed set of values spelled two
// ways — `enum { Pending = "pending" }` and `type X = "pending"`. Names differ by
// construction, so no name-based signal can see it; the VALUES decide.
const sameValueSet = (a, b) => {
	const A = a.values ?? [];
	const B = b.values ?? [];
	if (!A.length || !B.length) return null;
	// Only a closed set counts: an enum, or a type made of literals.
	if (![a.kind, b.kind].includes("enum") && ![...A, ...B].length) return null;
	if (A.length !== B.length) return null;
	const setB = new Set(B);
	if (!A.every((v) => setB.has(v))) return null;

	return {
		isDuplicate: true,
		tier: "duplicate",
		confidence: 0.95,
		reason: `same value set: ${a.name} and ${b.name} stand for the same ${A.length} value(s)`,
	};
};

const decide = (a, b, { signals, weights: rawWeights, thresholds: rawThresholds }: any = {}) => {
	const weights = resolveWeights(rawWeights);
	const thresholds = resolveThresholds(rawThresholds);
	const sig = signals || {};
	const zero = { properties: 0, methods: 0, signature: 0, values: 0, name: 0, inheritance: 0 };

	// An alias is reuse, not duplication: `type X = Y` stands for Y itself. The
	// verdict is `alias` (shown under Inheritance), never a duplicate.
	const alias = aliasPair(a, b);
	if (alias) {
		return {
			isDuplicate: false,
			confidence: 0.9,
			tier: "alias",
			reason: `alias: ${alias.alias.name} is an alias of ${alias.target.name} — inheritance, not duplication`,
			signals: sig,
			contributions: { ...zero, inheritance: sig.inheritance?.score ?? 1 },
			thresholds,
			weights,
			evidencing: ["inheritance"],
		};
	}

	// A closed set of values is the same whoever spells it: an enum, a literal
	// union, or the two together.
	const sameValues = sameValueSet(a, b);
	if (sameValues) return { ...sameValues, signals: sig, contributions: { ...zero, values: 1 }, thresholds, weights, evidencing: ["values"] };

	// Fast paths: structural facts that make a pair a duplicate no matter what
	// the weighted signal blend says.
	const storeCopy = isStoreModelCopy(a, b);
	if (storeCopy) {
		const type = a.kind === "type" ? a : b;
		const store = a.storeModel ? a : b;
		const conf = Math.min(0.95, round(0.5 * storeCopy.evidence.overlap + 0.5 * storeCopy.evidence.typeAgreement + 0.45));
		return {
			isDuplicate: true,
			confidence: conf,
			tier: "duplicate",
			reason: `store-model copy: ${type.name} duplicates the shape of store model ${store.name} (overlap ${storeCopy.evidence.overlap.toFixed(2)}, typeAgreement ${storeCopy.evidence.typeAgreement.toFixed(2)})`,
			signals: sig,
			contributions: { ...zero, properties: storeCopy.score },
			thresholds,
			weights,
			evidencing: ["properties", NAME_KEY],
		};
	}

	// A full value-tree match under different names is a renamed copy: the values
	// decide, the shape signals stand down.
	const valuesEvidence = sig.values && sig.values.hasEvidence !== false && sig.values.evidence ? sig.values.evidence : null;
	const valuesIdentical = valuesEvidence && valuesEvidence.identical;
	if (valuesIdentical) {
		return {
			isDuplicate: true,
			confidence: 0.93,
			tier: "duplicate",
			reason: `renamed copy: ${a.name} and ${b.name} hold identical values under different names`,
			signals: sig,
			contributions: { ...zero, values: 1 },
			thresholds,
			weights,
			evidencing: ["values"],
		};
	}

	// When the two entities carry comparable values that DIFFER, a shape-only
	// match is not a duplicate: same field names/types with different contents is
	// two configs that share a shape, not a copy. The values veto the identical-
	// shape fast path; the weighted blend below still reports partial similarity.
	const valuesDiffer = valuesEvidence && !valuesEvidence.identical;
	const identical = valuesDiffer ? null : isIdenticalShape(a, b, sig);
	if (identical) {
		return {
			isDuplicate: true,
			confidence: identical.confidence,
			tier: identical.tier,
			reason: identical.reason,
			signals: sig,
			contributions: { ...zero, properties: sig.properties.score },
			thresholds,
			weights,
			evidencing: ["properties"],
		};
	}

	// The identity budget is the full weight the identity signals carry by default;
	// it is re-distributed over whichever of them have evidence for this pair.
	// `values` participates only when it has evidence; its default weight is 0, so
	// a partial value match informs the explanation without moving the verdict —
	// a FULL value match is the renamed-copy fast path above.
	const identityBudget = IDENTITY_KEYS.reduce((sum, k) => sum + weights[k], 0);
	const evidencing = IDENTITY_KEYS.filter((k) => hasEvidence(sig[k]));
	const evidencingWeight = evidencing.reduce((sum, k) => sum + weights[k], 0);

	const contributions = {};
	for (const k of IDENTITY_KEYS) {
		if (!hasEvidence(sig[k]) || evidencingWeight === 0) {
			contributions[k] = 0;
			continue;
		}
		contributions[k] = (sig[k].score ?? 0) * (weights[k] / evidencingWeight) * identityBudget;
	}
	// `name` is always present and always contributes its fixed weight.
	contributions[NAME_KEY] = (sig[NAME_KEY]?.score ?? 0) * weights[NAME_KEY];

	const confidence = round(Object.values(contributions).reduce((sum: number, v: any) => sum + v, 0));

	let tier = null;
	if (confidence >= thresholds.duplicate) tier = "duplicate";
	else if (confidence >= thresholds.extract) tier = "extract";
	else if (confidence >= thresholds.similar) tier = "similar";

	// Comparable values that DIFFER veto a duplicate: same field names/types with
	// different contents is two entities that share a shape, not a copy. The pair
	// may still be an extraction candidate / similar, but never a duplicate.
	if (valuesDiffer && tier === "duplicate") tier = "extract";

	const reason =
		`confidence ${confidence.toFixed(2)} ` +
		`(properties ${(sig.properties?.score ?? 0).toFixed(2)}, methods ${(sig.methods?.score ?? 0).toFixed(2)}, ` +
		`signature ${(sig.signature?.score ?? 0).toFixed(2)}, values ${(sig.values?.score ?? 0).toFixed(2)}, name ${(sig.name?.score ?? 0).toFixed(2)}, inheritance ${(sig.inheritance?.score ?? 0).toFixed(2)})` +
		(evidencing.length < IDENTITY_KEYS.length ? ` [evidence: ${[...evidencing, NAME_KEY].join(", ")}]` : "");

	return {
		isDuplicate: tier === "duplicate",
		confidence,
		tier,
		reason,
		signals: sig,
		contributions,
		thresholds,
		weights,
		evidencing: [...evidencing, NAME_KEY],
	};
};

// Decide ONCE over a list of raw candidates. Each candidate is turned into a
// single *fact* the tree-builder can assemble with no further judgement:
//
//   subset       -> { type: "inclusion", parent, child, score }
//                   parent is the larger shape, child the smaller one. `score`
//                   is how much of the parent the child covers (jaccard) — a
//                   child that is nearly the whole parent scores close to 1.
//   intersection -> { type: "extract", left, right, shared, score, suggest }
//                   `shared` is the list of common property names; `score` is the
//                   overlap of the two shapes; `suggest` names the shared type.
const sharedNames = (a, b) => {
	const bmap = new Map((b.properties || []).map((p) => [p.name, p.type]));
	const out = [];
	for (const p of a.properties || []) if (p.name && bmap.has(p.name)) out.push(p.name);

	return out;
};

// Fraction of shared property names whose canonical type agrees (1 when there
// are no shared names — no evidence to discount). Same definition as
// matcher/properties.js so the fact score and the old-pipeline signal agree.
const typeAgreement = (a, b) => {
	const amap = new Map((a.properties || []).map((p) => [p.name, p.type]));
	const bmap = new Map((b.properties || []).map((p) => [p.name, p.type]));
	let shared = 0;
	let agree = 0;
	for (const [name, type] of amap) {
		if (bmap.has(name)) {
			shared += 1;
			if (type === bmap.get(name)) agree += 1;
		}
	}

	return shared === 0 ? 1 : agree / shared;
};

// Shape size on the SAME name set the containment test uses — the ignored
// members are stripped, so a shape that is small after filtering but carries
// many ignored props (id, name, code, ...) is not mistaken for the larger one.
const filteredNameSize = (e, ignored) => new Set((e.properties || []).map((p) => p.name).filter((n) => n && !ignored.has(n))).size;

const decideFacts = (candidates, opts: any = {}) => {
	const T = { ...DEFAULT_TUNING.properties, ...((opts.tuning || {}).properties || {}) };
	const ignored = new Set(opts.ignoredMembers || []);
	const facts = [];
	for (const c of candidates || []) {
		const { a, b, kind, rawMetrics } = c;
		if (kind === "subset") {
			// Orient by the filtered shape size (the same set the matcher used to
			// decide containment), not raw length, so ignored props cannot flip
			// the parent/child orientation of a subset.
			const [parent, child] = filteredNameSize(a, ignored) >= filteredNameSize(b, ignored) ? [a, b] : [b, a];
			// A name-only 1.00 is "too round": discount by the fraction of shared
			// names whose types disagree, so only a genuine name+type match hits 1.
			const score = round(rawMetrics.jaccard * (1 - T.typeDiscount * (1 - typeAgreement(parent, child))));
			facts.push({ type: "inclusion", parent, child, score, rawMetrics });
		} else if (kind === "intersection") {
			const shared = sharedNames(a, b);
			// Score with the SAME properties matcher the pair path uses, so the two
			// paths agree on a pair's similarity. Raw overlap (inter/min) saturates
			// to 1.00 for any identical filtered name set; the matcher's small/tiny
			// /single-shared/generic discounts pull a tiny full-overlap pair below it.
			const score = round(propertyScore(a, b, { ignoredMembers: ignored, tuning: T }).score);
			facts.push({
				type: "extract",
				left: a,
				right: b,
				shared,
				score,
				suggest: `extract a shared type for ${shared.join(", ")}`,
				rawMetrics,
			});
		}
	}

	return facts;
};

export {  decide, decideFacts, resolveWeights, resolveThresholds, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS  };

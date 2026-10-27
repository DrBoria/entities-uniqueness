"use strict";

// Combines the five signals into a single confidence (0..1) and a tier.
//
// Default weights are the user's formula:
//   confidence = 0.25*properties + 0.30*methods + 0.20*signature
//              + 0.15*name + 0.10*inheritance
//
// Tiers:
//   duplicate : confidence >= duplicate threshold (default 0.85)
//   extract   : confidence >= extract threshold   (default 0.50)
//   similar   : confidence >= similar threshold   (default 0.35)
//   (none)    : below similar — not reported as a candidate
//
// `reason` always lists every signal's contribution so a score is explainable.

const { DEFAULT_TUNING } = require("./tuning");
const { score: propertyScore } = require("./matcher/properties.js");

const DEFAULT_WEIGHTS = DEFAULT_TUNING.weights;
const DEFAULT_THRESHOLDS = DEFAULT_TUNING.thresholds;

// The four *identity* signals (structure of the entity) share a fixed budget of
// `1 - name_weight` and are re-normalized over whichever of them carry evidence
// for a given pair. `name` is a separate, always-on bonus (names always exist)
// that is never re-normalized upward, so a weak name match cannot dominate a pair
// whose real signal is its structure.
const IDENTITY_KEYS = ["properties", "methods", "signature", "inheritance"];
const NAME_KEY = "name";

const round = (n) => Math.round(n * 1000) / 1000;

// Per-key fallback so a partial override keeps the rest of the defaults.
const resolveWeights = (override) => {
	const o = override || {};

	return {
		properties: o.properties ?? DEFAULT_WEIGHTS.properties,
		methods: o.methods ?? DEFAULT_WEIGHTS.methods,
		signature: o.signature ?? DEFAULT_WEIGHTS.signature,
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
// carries no shape of its own — it is a duplicate of `Y` by definition.
const isAliasDuplicate = (a, b) => (a.aliasOf === b.name || b.aliasOf === a.name);

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

const decide = (a, b, { signals, weights: rawWeights, thresholds: rawThresholds } = {}) => {
	const weights = resolveWeights(rawWeights);
	const thresholds = resolveThresholds(rawThresholds);
	const sig = signals || {};

	// Fast paths: structural facts that make a pair a duplicate no matter what
	// the weighted signal blend says.
	if (isAliasDuplicate(a, b)) {
		const alias = a.aliasOf === b.name ? a : b;
		const target = a.aliasOf === b.name ? b : a;
		return {
			isDuplicate: true,
			confidence: 0.9,
			tier: "duplicate",
			reason: `alias duplicate: ${alias.name} is an alias of ${target.name}`,
			signals: sig,
			contributions: { properties: 0, methods: 0, signature: 0, name: 0, inheritance: 0 },
			thresholds,
			weights,
			evidencing: [NAME_KEY],
		};
	}
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
			contributions: { properties: storeCopy.score, methods: 0, signature: 0, name: 0, inheritance: 0 },
			thresholds,
			weights,
			evidencing: ["properties", NAME_KEY],
		};
	}

	const identical = isIdenticalShape(a, b, sig);
	if (identical) {
		return {
			isDuplicate: true,
			confidence: identical.confidence,
			tier: identical.tier,
			reason: identical.reason,
			signals: sig,
			contributions: { properties: sig.properties.score, methods: 0, signature: 0, name: 0, inheritance: 0 },
			thresholds,
			weights,
			evidencing: ["properties"],
		};
	}

	// The identity budget is the full weight the identity signals carry by default;
	// it is re-distributed over whichever of them have evidence for this pair.
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

	const confidence = round(Object.values(contributions).reduce((sum, v) => sum + v, 0));

	let tier = null;
	if (confidence >= thresholds.duplicate) tier = "duplicate";
	else if (confidence >= thresholds.extract) tier = "extract";
	else if (confidence >= thresholds.similar) tier = "similar";

	const reason =
		`confidence ${confidence.toFixed(2)} ` +
		`(properties ${(sig.properties?.score ?? 0).toFixed(2)}, methods ${(sig.methods?.score ?? 0).toFixed(2)}, ` +
		`signature ${(sig.signature?.score ?? 0).toFixed(2)}, name ${(sig.name?.score ?? 0).toFixed(2)}, inheritance ${(sig.inheritance?.score ?? 0).toFixed(2)})` +
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

const decideFacts = (candidates, opts = {}) => {
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

module.exports = { decide, decideFacts, resolveWeights, resolveThresholds, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS };

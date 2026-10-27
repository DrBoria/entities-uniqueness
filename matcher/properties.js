"use strict";

// Jaccard + overlap coefficient over property names.
//
// `ignoredMembers` is a *config-supplied* list (default: id/createdAt/updatedAt
// and friends) — it is never hardcoded here. Property *types* are compared via
// the canonical type string, so `string | null` ≡ `string?`.

const { GENERIC_TYPES } = require("../normalizer/index.js");
const { DEFAULT_TUNING } = require("../tuning");

const nameSet = (props, ignored) => new Set((props || []).map((p) => p.name).filter((n) => n && !ignored.has(n)));

const jaccard = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;
	const uni = a.size + b.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const overlap = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	const min = Math.min(a.size, b.size);
	if (min === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;

	return inter / min;
};

// How many shared properties also agree on canonical type.
const typeAgreement = (a, b) => {
	const amap = new Map((a || []).map((p) => [p.name, p.type]));
	const bmap = new Map((b || []).map((p) => [p.name, p.type]));
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

// Brand/discriminant properties: a boolean-literal-typed field (`x: true`)
// exists to make a type *nominally* distinct — it is identity, not data. When
// two entities carry DIFFERENT brand sets (one has a brand the other lacks, or
// they carry different brands), they are intentionally distinct nominal types,
// so the overlap of their remaining data fields is a poor "duplicate" proxy.
// Returns false only when both sides carry the exact same set of brands (which
// may be empty).
const brandSet = (props) => new Set((props || []).filter((p) => p && (p.type === "true" || p.type === "false")).map((p) => p.name));

const brandsDiffer = (a, b) => {
	const A = brandSet(a.properties);
	const B = brandSet(b.properties);
	if (A.size === 0 && B.size === 0) return false;
	if (A.size === 0 || B.size === 0) return true;
	for (const x of A) if (!B.has(x)) return true;
	for (const x of B) if (!A.has(x)) return true;

	return false;
};

// Fraction of shared property names whose canonical type is a generic
// placeholder (no verified type). Returns 0 when there are no shared names.
const genericShare = (a, b) => {
	const amap = new Map((a || []).map((p) => [p.name, p.type]));
	const bmap = new Map((b || []).map((p) => [p.name, p.type]));
	let shared = 0;
	let generic = 0;
	for (const [name, type] of amap) {
		if (bmap.has(name)) {
			shared += 1;
			if (GENERIC_TYPES.has(type) || GENERIC_TYPES.has(bmap.get(name))) generic += 1;
		}
	}

	return shared === 0 ? 0 : generic / shared;
};

const score = (a, b, opts = {}) => {
	const ignored = new Set(opts.ignoredMembers || []);
	const T = { ...DEFAULT_TUNING.properties, ...(opts.tuning || {}) };
	const A = nameSet(a.properties, ignored);
	const B = nameSet(b.properties, ignored);
	const hasEvidence = A.size > 0 || B.size > 0;
	// No evidence when neither entity declares any (non-ignored) properties — the
	// signal cannot discriminate the pair, so it scores 0 (not a neutral 1.0) and the
	// decision-maker redistributes its weight.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { jaccard: 0, overlap: 0, typeAgreement: 0, aCount: 0, bCount: 0 } };
	}
	const j = jaccard(A, B);
	const o = overlap(A, B);
	const t = typeAgreement(a.properties, b.properties);
	const g = genericShare(a.properties, b.properties);
	// Name overlap is discounted proportionally to the fraction of shared names
	// whose canonical types disagree, so the score stays a continuous scale.
	const nameOverlap = T.jaccardWeight * j + T.overlapWeight * o;
	let value = nameOverlap * (1 - T.typeDiscount * (1 - t));
	// Small-shape discount: when the union of property names is tiny, full
	// overlap is almost certain for unrelated records, so the 1.00 ceiling is
	// not a meaningful "identical" — pull it down a touch instead.
	let inter = 0;
	for (const x of A) if (B.has(x)) inter += 1;
	const union = A.size + B.size - inter;
	if (union < T.smallShapeUnion && value > 0) value *= 1 - T.smallShapeDiscount * ((T.smallShapeUnion - union) / T.smallShapeUnion);
	// Generic-shape discount: when most shared names carry only unverified
	// placeholder types, name agreement alone is weak evidence — pull the score
	// down proportionally so same-shape un-annotated literals stay off 1.00.
	// However, a FULLY identical shape (jaccard=1, overlap=1, typeAgreement=1)
	// is a copy-paste by definition — the shapes are byte-for-byte the same
	// regardless of whether types are verified — so the discount never applies
	// to it, whether the twins live in one file or two.
	const fullyIdentical = j >= 1 && o >= 1 && t >= 1;
	if (g > 0 && value > 0 && !fullyIdentical) value *= 1 - T.genericShapeDiscount * g;
	// Single-shared-name discount: one shared field is too little to call the
	// shapes similar (see SINGLE_SHARED_DISCOUNT).
	if (inter === 1 && value > 0) value *= T.singleSharedDiscount;
	// Tiny-shape discount: when both entities' ENTIRE body is a handful of
	// fields (counted before anything is ignored) AND neither carries methods,
	// full overlap is nearly certain for unrelated records, so the score is
	// halved (see TINY_SHAPE_DISCOUNT). Gated on the pre-ignore count so a
	// genuine three-field shape that ignores one member keeps full strength,
	// and on the absence of methods so a real two-field CLASS (whose behavior
	// gives it identity beyond its data shape) is not penalized.
	const aTotal = (a.properties || []).filter((p) => p && p.name).length;
	const bTotal = (b.properties || []).filter((p) => p && p.name).length;
	const aMethods = (a.methods || []).length;
	const bMethods = (b.methods || []).length;
	if (aTotal <= T.tinyShapeMaxFields && bTotal <= T.tinyShapeMaxFields && aMethods === 0 && bMethods === 0 && value > 0) value *= T.tinyShapeDiscount;
	// Nominal-brand discount: when the two entities carry DIFFERENT brand /
	// discriminant properties (boolean-literal fields like `__range: true`),
	// they are intentionally distinct nominal types, so shared data fields are
	// weak duplicate evidence — pull the score down (see brandsDiffer).
	if (brandsDiffer(a, b) && value > 0) value *= 1 - T.brandDiscount;

	return { score: value, hasEvidence, evidence: { jaccard: round(j), overlap: round(o), typeAgreement: round(t), genericShare: round(g), aCount: A.size, bCount: B.size, inter, union, aTotal, bTotal, brandsDiffer: brandsDiffer(a, b) } };
};

const round = (n) => Math.round(n * 1000) / 1000;

module.exports = { score };

"use strict";

// Central tuning defaults for every numeric knob in the pipeline.
//
// Before this file the constants were scattered across the matchers, the
// suggester, the clusterer and the filters (JACCARD_WEIGHT here, CLUSTER_LINK_
// FLOOR there, MIN_MEAT over there). Now every knob lives in ONE object so a
// consumer can override any of them via config without hunting through files,
// and the defaults are the single source of truth.
//
// Stages read their knobs from a `tuning` object threaded through their
// options; when a knob is absent it falls back to DEFAULT_TUNING, so partial
// overrides keep the rest of the defaults.

const DEFAULT_TUNING = {
	// decision-maker: signal weights + tier thresholds
	weights: { properties: 0.25, methods: 0.3, signature: 0.2, name: 0.15, inheritance: 0.1 },
	thresholds: { duplicate: 0.85, extract: 0.55, similar: 0.35 },

	// candidate matcher (raw geometry, pre-decision)
	candidates: {
		subsetMinFields: 2,
		intersectionMaxSizeDiff: 1,
		intersectionMinOverlap: 0.6,
		intersectionMinShared: 2,
	},

	// properties matcher
	properties: {
		jaccardWeight: 0.6,
		overlapWeight: 0.4,
		typeDiscount: 0.5,
		smallShapeUnion: 4,
		smallShapeDiscount: 0.15,
		genericShapeDiscount: 0.3,
		singleSharedDiscount: 0.5,
		tinyShapeDiscount: 0.5,
		tinyShapeMaxFields: 2,
	},

	// methods matcher
	methods: { jaccardWeight: 0.6, overlapWeight: 0.4 },

	// name matcher
	name: { levenshteinWeight: 0.5, tokenWeight: 0.5 },

	// signature matcher
	signature: { singleMethodDiscount: 0.3 },

	// clusterer
	cluster: { linkFloor: 0.7 },

	// suggester
	suggester: {
		sharedMethodsMinEntities: 3,
		sharedMethodsMinCount: 2,
		propertyOverlapMinEntities: 2,
		propertyOverlapMinFields: 2,
		subsetMinFields: 3,
	},

	// filters
	filters: { frameworkResidualMinMeat: 4 },
};

// Shallow-merge one level deep per section: a partial override of a section
// keeps the missing keys from the defaults.
const mergeSection = (base, override) => ({ ...base, ...(override && typeof override === "object" ? override : {}) });

const resolveTuning = (override) => {
	const o = override && typeof override === "object" ? override : {};

	return {
		weights: mergeSection(DEFAULT_TUNING.weights, o.weights),
		thresholds: mergeSection(DEFAULT_TUNING.thresholds, o.thresholds),
		candidates: mergeSection(DEFAULT_TUNING.candidates, o.candidates),
		properties: mergeSection(DEFAULT_TUNING.properties, o.properties),
		methods: mergeSection(DEFAULT_TUNING.methods, o.methods),
		name: mergeSection(DEFAULT_TUNING.name, o.name),
		signature: mergeSection(DEFAULT_TUNING.signature, o.signature),
		cluster: mergeSection(DEFAULT_TUNING.cluster, o.cluster),
		suggester: mergeSection(DEFAULT_TUNING.suggester, o.suggester),
		filters: mergeSection(DEFAULT_TUNING.filters, o.filters),
	};
};

module.exports = { DEFAULT_TUNING, resolveTuning };

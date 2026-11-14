"use strict";

// ── MATCHERS · the one registry ─────────────────────────────────────────────
//
// The five comparison groups each live in their own folder with their own MODEL
// and their own CLI TEXT:
//
//   matchers/properties/   { model.js, text.js }
//   matchers/methods/
//   matchers/signature/    (also carries the entity name — no separate Name group)
//   matchers/values/
//   matchers/inheritance/
//
// This registry binds them by the SIGNAL key the engine uses, so the page, the
// markdown report and the decision can never disagree about which group is which.
//
// Unlike utils (which compares function bodies), the candidates here are ENTITIES
// — flat `{name, kind, properties[], methods[], extends, implements}` objects.
// `analyze(left, right, opts)` returns one model per signal; `describe` the CLI
// lines. `opts` carries `{ignoredMembers, tuning}` so the models score exactly as
// the engine's matchers do.

import { SIGNAL, SIGNAL_ORDER } from "../../constants";

const properties = { key: SIGNAL.Properties, model: require("./properties/model"), text: require("./properties/text") };
const methods = { key: SIGNAL.Methods, model: require("./methods/model"), text: require("./methods/text") };
const signature = { key: SIGNAL.Signature, model: require("./signature/model"), text: require("./signature/text") };
const values = { key: SIGNAL.Values, model: require("./values/model"), text: require("./values/text") };
const inheritance = { key: SIGNAL.Inheritance, model: require("./inheritance/model"), text: require("./inheritance/text") };

const BY_KEY = new Map<string, any>([
	[properties.key, properties],
	[methods.key, methods],
	[signature.key, signature],
	[values.key, values],
	[inheritance.key, inheritance],
]);

// In the order the report reads the groups.
const MATCHERS = SIGNAL_ORDER.map((key) => BY_KEY.get(key)).filter(Boolean);

// Every model for one pair, keyed by SIGNAL: `{ properties: model, … }`.
const analyze = (leftEntity, rightEntity, opts = {}) => {
	const out = {};
	for (const matcher of MATCHERS) out[matcher.key] = matcher.model.build(leftEntity, rightEntity, opts);

	return out;
};

// The text lines for one pair, in the same order — used by the CLI report.
const describe = (leftEntity, rightEntity, opts = {}) => {
	const out = [];
	for (const matcher of MATCHERS) {
		const model = matcher.model.build(leftEntity, rightEntity, opts);
		if (!model) continue;
		const lines = matcher.text.text(model);
		if (lines.length > 0) out.push({ key: matcher.key, lines });
	}

	return out;
};

export const matcherOf = (key) => BY_KEY.get(key) ?? null;
export { MATCHERS, analyze, describe };

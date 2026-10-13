"use strict";

// Filter registry + applyFilters.
//
// A filter is { name, test(match) -> reasonString|null }. If test returns a
// string, the match is dropped with that reason; null means "keep". Filters run
// in order and the first hit wins.

const dropUsages = require("./drop-usages");
const dropInheritance = require("./drop-inheritance");
const frameworkResidual = require("./framework-residual");
const log = require("../logger");

const buildFilters = (tuning) => [dropUsages, dropInheritance, { name: frameworkResidual.name, test: frameworkResidual.makeTest(tuning) }];

const applyFilters = (matches, options = {}) => {
	const FILTERS = buildFilters(options.tuning);
	const kept = [];
	const dropped = [];
	for (const match of matches) {
		if (log.enabled()) {
			log.stage("filter:before", { a: { name: match.a.name, path: match.a.sourceFile }, b: { name: match.b.name, path: match.b.sourceFile }, confidence: match.decision.confidence });
		}
		let hit = null;
		for (const f of FILTERS) {
			const reason = f.test(match);
			if (reason) {
				hit = { match, filter: f.name, reason };
				break;
			}
		}
		if (hit) {
			dropped.push({ a: hit.match.a, b: hit.match.b, match: hit.match, filter: hit.filter, reason: hit.reason });
			if (log.enabled()) log.stage("filter:after", { a: { name: match.a.name, path: match.a.sourceFile }, b: { name: match.b.name, path: match.b.sourceFile }, outcome: "dropped", filter: hit.filter, reason: hit.reason });
		} else {
			kept.push(match);
			if (log.enabled()) log.stage("filter:after", { a: { name: match.a.name, path: match.a.sourceFile }, b: { name: match.b.name, path: match.b.sourceFile }, outcome: "kept", confidence: match.decision.confidence });
		}
	}

	return { kept, dropped };
};

module.exports = { applyFilters, buildFilters };

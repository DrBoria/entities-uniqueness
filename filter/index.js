"use strict";

// Applies the filter registry to raw matches.
//
// Each filter is either a plain `{ name, test(match) }` (test returns a reason
// string when the match must be dropped, or null to keep it) or a factory
// `{ name, makeTest(tuning) }` that produces such a test from the tuning.
// A match survives only if no filter rejects it.

const dropInheritance = require("./drop-inheritance.js");
const dropUsages = require("./drop-usages.js");
const dropStoreLinked = require("./drop-store-linked.js");
const frameworkResidual = require("./framework-residual.js");

const REGISTRY = [dropInheritance, dropUsages, dropStoreLinked, frameworkResidual];

const applyFilters = (matches, { tuning } = {}) => {
	const tests = REGISTRY.map((f) => ({
		name: f.name,
		test: typeof f.makeTest === "function" ? f.makeTest(tuning) : f.test,
	}));

	const kept = [];
	const dropped = [];
	for (const match of matches || []) {
		let reason = null;
		let filter = null;
		for (const t of tests) {
			const r = t.test(match);
			if (r) {
				reason = r;
				filter = t.name;
				break;
			}
		}
		if (reason) dropped.push({ ...match, reason, filter });
		else kept.push(match);
	}

	return { kept, dropped };
};

module.exports = { applyFilters, REGISTRY };

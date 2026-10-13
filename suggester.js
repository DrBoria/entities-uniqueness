"use strict";

// Refactor suggestions, derived from clusters (not from individual pairs).
//
// Rules (no hardcoded word lists — driven by the cluster's own members):
//   1. 3+ entities sharing overlapping *methods*  -> extract a shared base
//      class / interface (SharedBase / ICommonBehavior).
//   2. 2+ entities overlapping only on *properties* (no shared methods)
//      -> extract a shared type / interface for the common fields.
//   3. one entity's members are a strict subset of another's -> extract the
//      subset into its own type and have the larger one reference it.

const { DEFAULT_TUNING } = require("./tuning");

const sharedMethodNames = (members) => {
	const sets = members.map((m) => new Set((m.methods || []).map((x) => x.name)));
	if (sets.length === 0) return [];
	const common = [...sets[0]];
	for (const set of sets.slice(1)) for (let i = common.length - 1; i >= 0; i -= 1) if (!set.has(common[i])) common.splice(i, 1);

	return common;
};

const sharedPropertyNames = (members) => {
	const sets = members.map((m) => new Set((m.properties || []).map((x) => x.name)));
	if (sets.length === 0) return [];
	const common = [...sets[0]];
	for (const set of sets.slice(1)) for (let i = common.length - 1; i >= 0; i -= 1) if (!set.has(common[i])) common.splice(i, 1);

	return common;
};

const isSubset = (small, big, T) => {
	const smallProps = new Set(small.properties.map((p) => p.name));
	const bigProps = new Set(big.properties.map((p) => p.name));
	// A tiny subset (fewer than T.subsetMinFields fields) is boilerplate noise,
	// not a real extraction — skip it even if it is technically contained.
	if (smallProps.size < T.subsetMinFields || smallProps.size >= bigProps.size) return false;
	for (const p of smallProps) if (!bigProps.has(p)) return false;

	return true;
};

const suggest = (clusters, opts = {}) => {
	const T = { ...DEFAULT_TUNING.suggester, ...(opts.tuning || {}) };
	const out = [];
	// The same pair can legitimately land in more than one cluster (transitive
	// linking), so a suggestion is only emitted once per (type, entities) key.
	const seen = new Set();
	const emit = (s) => {
		const key = `${s.type}|${[...s.entities].sort().join(",")}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push(s);
	};
	for (const cluster of clusters) {
		const members = cluster.members;
		const methods = sharedMethodNames(members);
		const properties = sharedPropertyNames(members);

		if (members.length >= T.sharedMethodsMinEntities && methods.length >= T.sharedMethodsMinCount) {
			emit({
				type: "shared-base",
				entities: members.map((m) => m.name),
				members: methods,
				reason: `${members.length} entities share ${methods.length} methods (${methods.join(", ")}) — extract a shared base class or interface (e.g. SharedBase / ICommonBehavior).`,
			});
			continue;
		}

		if (members.length >= T.propertyOverlapMinEntities && properties.length >= T.propertyOverlapMinFields && methods.length === 0) {
			emit({
				type: "shared-type",
				entities: members.map((m) => m.name),
				members: properties,
				reason: `${members.length} entities share only properties (${properties.join(", ")}) — extract a shared type/interface for the common fields.`,
			});
			continue;
		}

		// subset extraction: try each ordered pair
		for (let i = 0; i < members.length; i += 1) {
			for (let j = 0; j < members.length; j += 1) {
				if (i === j) continue;
				if (isSubset(members[i], members[j], T)) {
					emit({
						type: "subset-extraction",
						entities: [members[i].name, members[j].name],
						members: members[i].properties.map((p) => p.name),
						reason: `${members[i].name}'s fields are a subset of ${members[j].name}'s — extract ${members[i].name} into its own type and have ${members[j].name} reference it.`,
					});
				}
			}
		}
	}

	return out;
};

module.exports = { suggest };

"use strict";

// Groups matched pairs into clusters of mutually-similar entities.
//
// A cluster is a set of entities where each is "close enough" to at least one
// other member. We start from the highest-confidence pairs and grow clusters,
// merging when a new pair connects two existing clusters. This is a greedy
// connected-component over the (already filtered) match graph, seeded by
// confidence so the strongest links anchor each cluster.
//
// Only *strong* candidates (duplicate + extract) seed clusters: a weak "similar"
// link (0.35) is not enough evidence to group entities for a refactor, and
// letting it chain would merge unrelated entities into one giant cluster.
//
// Even within the strong tiers, a pair at the very bottom of the extract band
// (0.55) is too weak to merge entities into one refactor cluster: a chain of
// such links glues dozens of unrelated entities into a mega cluster. Only
// pairs at or above CLUSTER_LINK_FLOOR form edges; weaker pairs still appear
// in the pair tables, they just do not group.

const { DEFAULT_TUNING } = require("../tuning");

const CLUSTER_TIERS = new Set(["duplicate", "extract"]);

const clusterMatches = (matches, options = {}) => {
	const floor = options.clusterFloor ?? DEFAULT_TUNING.cluster.linkFloor;
	const strong = (matches || []).filter((m) => CLUSTER_TIERS.has(m.tier) && m.decision.confidence >= floor);
	if (strong.length === 0) return [];

	const byId = new Map();
	const link = (a, b) => {
		if (!byId.has(a.id)) byId.set(a.id, a);
		if (!byId.has(b.id)) byId.set(b.id, b);
	};
	for (const m of strong) link(m.a, m.b);

	// union-find
	const parent = new Map();
	const find = (x) => {
		let r = x;
		while (parent.get(r) !== r) r = parent.get(r);
		while (parent.get(x) !== r) {
			const next = parent.get(x);
			parent.set(x, r);
			x = next;
		}

		return r;
	};
	const union = (x, y) => {
		const rx = find(x);
		const ry = find(y);
		if (rx !== ry) parent.set(rx, ry);
	};
	for (const id of byId.keys()) parent.set(id, id);

	const sorted = [...strong].sort((p, q) => q.decision.confidence - p.decision.confidence);
	for (const m of sorted) union(m.a.id, m.b.id);

	const groups = new Map();
	for (const id of byId.keys()) {
		const r = find(id);
		if (!groups.has(r)) groups.set(r, []);
		groups.get(r).push(byId.get(id));
	}

	const clusters = [...groups.values()]
		.filter((g) => g.length >= 2)
		.map((members) => {
			// pairs within this cluster
			const pairs = sorted.filter((m) => members.some((x) => x.id === m.a.id) && members.some((x) => x.id === m.b.id));

			return { members: members.sort((x, y) => x.name.localeCompare(y.name)), pairs };
		})
		.sort((c, d) => d.members.length - c.members.length || d.pairs.length - c.pairs.length);

	return clusters;
};

module.exports = { clusterMatches };

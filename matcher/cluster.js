"use strict";

const { pipe, filter, sort, first, reduce, flatMap } = require("remeda");
const { sharedMembers } = require("./pair");

const pickCanonical = (recs) =>
	pipe(
		[...recs],
		sort((a, b) => {
			if (a.exported !== b.exported) return a.exported ? -1 : 1;
			if (b.members.length !== a.members.length) return b.members.length - a.members.length;
			return 0;
		}),
		first,
	);

const clusterSharedMembers = (recs, ignored) => {
	if (recs.length === 0) return [];
	const base = pipe(
		recs,
		reduce(
			(acc, r) => {
				const s = new Set(r.members);
				return pipe(acc, filter((m) => s.has(m)));
			},
			[...recs[0].members],
		),
	);
	return pipe(base, filter((m) => !ignored.has(m)), sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
};

const cluster = (pairs, records, ignored, thresholds) => {
	if (pairs.length === 0) return [];
	const pairKey = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`);
	const linked = new Set(pairs.map((p) => pairKey(p.a, p.b)));
	const clusters = [];
	const placed = new Set();
	const compat = (i, j) => (i === j ? true : linked.has(pairKey(i, j)));

	for (const p of pairs) {
		if (placed.has(p.a) || placed.has(p.b)) continue;
		const memberSet = new Set([p.a, p.b]);
		for (const q of pairs) {
			if (q === p) continue;
			const cand = memberSet.has(q.a) ? q.b : memberSet.has(q.b) ? q.a : null;
			if (cand === null || placed.has(cand) || memberSet.has(cand)) continue;
			let ok = true;
			for (const m of memberSet) {
				if (!compat(m, cand)) {
					ok = false;
					break;
				}
			}
			if (ok) memberSet.add(cand);
		}
		const recs = [...memberSet].map((i) => records[i]);
		const minShared = Math.min(
			...[...memberSet].flatMap((i) => [...memberSet].filter((j) => j !== i).map((j) => sharedMembers(records[i].members, records[j].members, ignored).length)),
		);
		const tier = minShared >= thresholds.duplicateMinShared ? "duplicate" : "suspicious";
		for (const i of memberSet) placed.add(i);
		clusters.push({
			canonical: pickCanonical(recs),
			members: recs,
			tier,
			shared: clusterSharedMembers(recs, ignored),
		});
	}
	clusters.sort((a, b) => b.members.length - a.members.length);
	return clusters;
};

module.exports = { cluster, pickCanonical };

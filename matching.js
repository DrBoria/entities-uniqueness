"use strict";

function sharedMembers(a, b, ignored) {
	const setA = new Set(a);
	const out = [];
	for (const m of b) {
		if (ignored.has(m)) continue;
		if (setA.has(m)) out.push(m);
	}
	return out;
}

function pickCanonical(recs) {
	return [...recs].sort((a, b) => {
		if (a.exported !== b.exported) return a.exported ? -1 : 1;
		if (b.members.length !== a.members.length) return b.members.length - a.members.length;
		return 0;
	})[0];
}

function pairShared(a, b, ignored, thresholds) {
	const shared = sharedMembers(a.members, b.members, ignored);
	if (shared.length < thresholds.suspiciousMinShared) return null;
	const smaller = Math.min(a.members.length, b.members.length);
	const ratio = smaller > 0 ? shared.length / smaller : 0;
	if (ratio < thresholds.minOverlapRatio) return null;
	return shared;
}

function match(records, thresholds) {
	const ignored = new Set(thresholds.ignoredMethods || []);
	const n = records.length;
	const eligible = [];
	for (let i = 0; i < n; i += 1) {
		if (records[i].members.length >= thresholds.minMembers) eligible.push(i);
	}

	const pairs = [];
	for (let x = 0; x < eligible.length; x += 1) {
		const i = eligible[x];
		for (let y = x + 1; y < eligible.length; y += 1) {
			const j = eligible[y];
			const shared = pairShared(records[i], records[j], ignored, thresholds);
			if (shared) pairs.push({ a: i, b: j, shared });
		}
	}
	pairs.sort((p, q) => q.shared.length - p.shared.length);

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
		const minShared = Math.min(...[...memberSet].flatMap((i) => [...memberSet].filter((j) => j !== i).map((j) => sharedMembers(records[i].members, records[j].members, ignored).length)));
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

	return { clusters, pairs };
}

function clusterSharedMembers(recs, ignored) {
	if (recs.length === 0) return [];
	const base = new Set(recs[0].members);
	for (const r of recs.slice(1)) {
		const s = new Set(r.members);
		for (const m of [...base]) if (!s.has(m)) base.delete(m);
	}
	return [...base].filter((m) => !ignored.has(m)).sort();
}

module.exports = { match, pickCanonical };

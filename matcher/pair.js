"use strict";

const { pipe, filter } = require("remeda");

const sharedMembers = (a, b, ignored) => {
	const setA = new Set(a);
	return pipe(b, filter((m) => !ignored.has(m) && setA.has(m)));
};

const pairShared = (a, b, ignored, thresholds) => {
	const shared = sharedMembers(a.members, b.members, ignored);
	if (shared.length < thresholds.suspiciousMinShared) return null;
	const smaller = Math.min(a.members.length, b.members.length);
	const ratio = smaller > 0 ? shared.length / smaller : 0;
	if (ratio < thresholds.minOverlapRatio) return null;
	return shared;
};

const findPairs = (records, ignored, thresholds) => {
	const eligible = records.map((_, i) => i).filter((i) => records[i].members.length >= thresholds.minMembers);
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
	return pairs;
};

module.exports = { pairShared, findPairs, sharedMembers };

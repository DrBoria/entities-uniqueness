"use strict";

// GRADED method correspondence — the methods twin of the properties matcher.
//
// Exact-name overlap alone reads a one-letter rename (`fetchTicket` vs
// `fetchTirket`) as ZERO shared methods, although the two behaviour sets are
// plainly the same. This module pairs each left method with its most similar
// right method (normalized edit distance, case-insensitive) and keeps the pairs
// whose similarity clears a high floor. A pair contributes its similarity, not
// a bare 1, so the score stays a continuous scale: identical names weigh 1, a
// one-letter miss weighs ~0.9, unrelated names do not pair at all.
//
// The pairing is greedy by descending similarity and one-to-one: a method is
// never counted twice, and a surplus method on either side lowers the overlap.

import { levenshtein } from "./name";

// A rename this close is the same method spelled slightly differently; below
// it the names are different methods (a ceremony prefix is handled separately).
const NEAR_MISS_FLOOR = 0.8;

const simOf = (a, b) => {
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;

	return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
};

export interface MethodPair {
	readonly left: string;
	readonly right: string;
	readonly sim: number;
	readonly exact: boolean;
}

/** One-to-one pairs of two name sets, exact matches first, then near misses. */
const pairMethods = (A: ReadonlySet<string>, B: ReadonlySet<string>, floor = NEAR_MISS_FLOOR): MethodPair[] => {
	const pairs: MethodPair[] = [];
	const usedB = new Set<string>();
	// Exact names are identity: pair them before any similarity guess.
	for (const a of A) {
		if (B.has(a)) {
			pairs.push({ left: a, right: a, sim: 1, exact: true });
			usedB.add(a);
		}
	}
	// The remaining names: every candidate above the floor, best first.
	const candidates: MethodPair[] = [];
	for (const a of A) {
		if (usedB.has(a) && B.has(a)) continue;
		for (const b of B) {
			if (usedB.has(b)) continue;
			const sim = simOf(a, b);
			if (sim >= floor) candidates.push({ left: a, right: b, sim, exact: false });
		}
	}
	candidates.sort((x, y) => y.sim - x.sim);
	const usedA = new Set(pairs.map((p) => p.left));
	for (const c of candidates) {
		if (usedA.has(c.left) || usedB.has(c.right)) continue;
		pairs.push(c);
		usedA.add(c.left);
		usedB.add(c.right);
	}

	return pairs;
};

/** Weighted intersection of the pairs (exact = 1, near miss = its similarity). */
const pairedWeight = (pairs: readonly MethodPair[]): number => pairs.reduce((sum, p) => sum + p.sim, 0);

export { pairMethods, pairedWeight, simOf, NEAR_MISS_FLOOR };
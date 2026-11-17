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

// ── Ceremony prefix ─────────────────────────────────────────────────────────
// A uniform leading prefix on EVERY method of one side
// (`internalRepositoryFetchCustomer` vs `fetchCustomer`) hides an otherwise
// identical method set. The prefix must be substantial (≥4 chars) and present
// on EVERY method of that side. The suffix match is case-insensitive on the
// first letter (camelCase boundary). Returned as PAIRS at PREFIX_SIM so the
// rows/links show the correspondence the score already counts.

const PREFIX_SIM = 0.85;

const decap = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);

const endsWithCI = (name: string, target: string): boolean => {
	if (name.length <= target.length) return false;
	const tail = name.slice(name.length - target.length);
	return tail[0].toLowerCase() + tail.slice(1) === target[0].toLowerCase() + target.slice(1);
};

/** One-to-one prefix pairs: strip a shared prefix from one side, match exactly. */
const prefixPairs = (A: ReadonlySet<string>, B: ReadonlySet<string>): { pairs: MethodPair[]; prefix: string; side: "a" | "b" } | null => {
	const a = [...A];
	const b = [...B];
	if (a.length === 0 || b.length === 0 || a.length !== b.length) return null;
	const trySide = (names: string[], targets: string[], side: "a" | "b") => {
		const targetSet = new Set(targets);
		const candidates = new Set<string>();
		for (const name of names) {
			for (const target of targets) {
				if (endsWithCI(name, target)) {
					const prefix = name.slice(0, name.length - target.length);
					if (prefix.length >= 4) candidates.add(prefix);
				}
			}
		}
		for (const prefix of candidates) {
			const stripped = names.map((n) => (n.startsWith(prefix) ? decap(n.slice(prefix.length)) : n));
			if (!stripped.every((n) => targetSet.has(n))) continue;
			const pairs: MethodPair[] = names.map((n, i) => {
				const own = stripped[i] ?? n;
				return side === "a" ? { left: n, right: own, sim: PREFIX_SIM, exact: false } : { left: own, right: n, sim: PREFIX_SIM, exact: false };
			});
			return { pairs, prefix, side };
		}

		return null;
	};

	return trySide(a, b, "a") ?? trySide(b, a, "b");
};

/** The FULL correspondence: exact names, then a uniform ceremony prefix, then
 *  near misses. This is what the score grades AND what the report draws — the
 *  number and the picture never disagree. */
const correspondMethods = (A: ReadonlySet<string>, B: ReadonlySet<string>): { pairs: MethodPair[]; prefix: string | null } => {
	const exact = pairMethods(A, B);
	const exactWeight = pairedWeight(exact);
	const uni = A.size + B.size - exactWeight;
	const j = uni === 0 ? 0 : exactWeight / uni;
	if (j > 0) return { pairs: exact, prefix: null };
	const prefixed = prefixPairs(A, B);
	if (prefixed !== null) return { pairs: prefixed.pairs, prefix: prefixed.prefix };

	return { pairs: exact, prefix: null };
};

export { pairMethods, pairedWeight, simOf, NEAR_MISS_FLOOR, prefixPairs, correspondMethods, PREFIX_SIM };
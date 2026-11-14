"use strict";

// Jaccard + overlap over method names.
//
// Method *names* drive the score; whether shared methods agree on signature is
// a separate signal (see ./signature.js). `ignoredMembers` is config-supplied.

import { DEFAULT_TUNING } from "../tuning";

const nameSet = (methods, ignored) => new Set((methods || []).map((m) => m.name).filter((n) => n && n !== "new" && n !== "call" && !ignored.has(n)));

const jaccard = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;
	const uni = a.size + b.size - inter;

	return uni === 0 ? 0 : inter / uni;
};

const overlap = (a, b) => {
	if (a.size === 0 && b.size === 0) return 1;
	const min = Math.min(a.size, b.size);
	if (min === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter += 1;

	return inter / min;
};

const round = (n) => Math.round(n * 1000) / 1000;

const decap = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

// A long ceremony prefix on EVERY method of one side (`internalRepositoryFetchCustomer`
// vs `fetchCustomer`) hides an otherwise identical method set. When one name set is
// exactly the other modulo a shared leading prefix, the methods correspond. The
// prefix must be substantial (≥ 4 chars) and present on EVERY method of that side,
// so a coincidental shared suffix on one method does not trigger it. The suffix
// comparison is case-insensitive on the first letter (camelCase boundary:
// `…RepositoryFetchCustomer` ends with `FetchCustomer`, the canon is `fetchCustomer`).
const stripSharedPrefix = (A, B) => {
	const a = [...A] as string[];
	const b = [...B] as string[];
	if (a.length === 0 || b.length === 0 || a.length !== b.length) return null;
	const endsWithCI = (name, target) => {
		if (name.length <= target.length) return false;
		const tail = name.slice(name.length - target.length);
		return tail[0].toLowerCase() + tail.slice(1) === target[0].toLowerCase() + target.slice(1);
	};
	const stripTo = (name, target) => name.slice(0, name.length - target.length);
	// Try stripping a prefix from the A side so it matches B exactly.
	const bSet = new Set(b);
	const candidates = new Set<string>();
	for (const name of a) {
		for (const target of b) {
			if (endsWithCI(name, target)) {
				const prefix = stripTo(name, target);
				if (prefix.length >= 4) candidates.add(prefix);
			}
		}
	}
	for (const prefix of candidates) {
		const stripped = a.map((n) => (n.startsWith(prefix) ? decap(n.slice(prefix.length)) : n));
		if (stripped.every((n) => bSet.has(n))) return { prefix, side: "a" };
	}
	// And the symmetric case (prefix on B).
	const aSet = new Set(a);
	const candidatesB = new Set<string>();
	for (const name of b) {
		for (const target of a) {
			if (endsWithCI(name, target)) {
				const prefix = stripTo(name, target);
				if (prefix.length >= 4) candidatesB.add(prefix);
			}
		}
	}
	for (const prefix of candidatesB) {
		const stripped = b.map((n) => (n.startsWith(prefix) ? decap(n.slice(prefix.length)) : n));
		if (stripped.every((n) => aSet.has(n))) return { prefix, side: "b" };
	}
	return null;
};

const score = (a, b, opts: any = {}) => {
	const T = { ...DEFAULT_TUNING.methods, ...(opts.tuning || {}) };
	const ignored = new Set(opts.ignoredMembers || []);
	const A = nameSet(a.methods, ignored);
	const B = nameSet(b.methods, ignored);
	const hasEvidence = A.size > 0 || B.size > 0;
	// No evidence when neither entity declares any methods — scores 0 (not a neutral
	// 1.0) and the decision-maker redistributes the weight.
	if (!hasEvidence) {
		return { score: 0, hasEvidence: false, evidence: { jaccard: 0, overlap: 0, aCount: 0, bCount: 0 } };
	}
	let j = jaccard(A, B);
	let o = overlap(A, B);
	let prefixNote = null;
	// Exact-name overlap is the primary evidence; a uniform ceremony prefix is a
	// recognized rename pattern, scored as a strong (not full) match.
	if (j === 0) {
		const stripped = stripSharedPrefix(A, B);
		if (stripped) {
			j = 0.85;
			o = 0.85;
			prefixNote = stripped.prefix;
		}
	}
	const value = T.jaccardWeight * j + T.overlapWeight * o;

	return { score: value, hasEvidence, evidence: { jaccard: round(j), overlap: round(o), aCount: A.size, bCount: B.size, ...(prefixNote ? { sharedPrefix: prefixNote } : {}) } };
};

export {  score  };

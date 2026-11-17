"use strict";

// Signature match: for methods the two entities CORRESPOND on (exact name or a
// near-miss rename), how many also agree on canonical parameter TYPES + return
// type. Parameter NAMES are local labels, not shape: `f(id: string)` and
// `f(ticketId: string)` are the same signature.
//
// This rewards "same shape" over "same name" — and it follows the SAME pairing
// the methods matcher uses (method-pairs), so a one-letter rename
// (`fetchTirket` ↔ `fetchTicket`) is compared on its signature instead of being
// invisible. The entity NAME is compared too, but as part of the signature
// verdict in the report (see report/matchers/signature) — the engine keeps it as
// the always-on `name` bonus in the decision-maker, not a tab.

import { DEFAULT_TUNING } from "../tuning";
import { correspondMethods } from "./method-pairs";
import { typesAgree } from "./type-key";

/** The shape key of a method: parameter TYPES (not names) + return type. */
const sigKey = (m) => {
	const types = m.paramTypes ?? m.params ?? [];
	return `(${types.join(",")}):${m.returnType || "void"}`;
};

/** Do two methods agree on parameter types (position-wise) and return type? */
const shapesAgree = (a, b) => {
	const ta = a.paramTypes ?? a.params ?? [];
	const tb = b.paramTypes ?? b.params ?? [];
	if (ta.length !== tb.length) return false;
	for (let i = 0; i < ta.length; i += 1) if (!typesAgree(ta[i], tb[i])) return false;

	return typesAgree(a.returnType || "void", b.returnType || "void");
};

// With a single shared method the ratio is binary (0 or 1) and reads as a
// perfect 1.00 even when the two entities are otherwise unrelated — e.g. two
// things that both happen to have a trivial `dispose()`. That is a weak
// "same signature" estimate, so discount it the same way the properties matcher
// discounts small shapes (see tuning.signature.singleMethodDiscount).

const score = (a, b, opts: any = {}) => {
	const T = { ...DEFAULT_TUNING.signature, ...(opts.tuning || {}) };
	const amap = new Map<string, any>((a.methods || []).map((m) => [m.name, m]));
	const bmap = new Map<string, any>((b.methods || []).map((m) => [m.name, m]));
	// Correspondence = the methods matcher's pairing (exact first, near misses
	// graded). A renamed method is still compared on its signature.
	const { pairs } = correspondMethods(new Set(amap.keys()), new Set(bmap.keys()));
	const shared = pairs.length;
	let match = 0;
	for (const p of pairs) {
		const ma = amap.get(p.left);
		const mb = bmap.get(p.right);
		if (ma && mb && shapesAgree(ma, mb)) match += 1;
	}
	// No corresponding methods -> the signal carries no evidence for the pair:
	// it scores 0 (not a neutral 1.0) and the decision-maker redistributes weight.
	if (shared === 0) {
		return { score: 0, hasEvidence: false, evidence: { shared: 0, matching: 0 } };
	}

	let value = match / shared;
	if (shared === 1 && value > 0) value *= 1 - T.singleMethodDiscount;

	return { score: value, hasEvidence: true, evidence: { shared, matching: match, singleMethod: shared === 1 } };
};

export { score, sigKey, shapesAgree };

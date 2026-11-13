"use strict";

// The vocabulary of the report, in one place:
//
//   describeComp(comp) -> findings[]
//
// Every finding is the same SHAPE, whatever produced it, and every sentence comes
// from a CODE (`./codes`):
//
//   { id, code, params, kind, label, color,      what it says and how it looks
//     left, right,                                the two places (or one)
//     confidence, tier,                           the numbers
//     message,                                    render(code, params)
//     fix,                                        the repair, structured
//     decision,                                   per-signal scores + why lines
//     evidence, dropped, members }                the raw facts behind it
//
// This is the single producer: the markdown report, the HTML page and (through
// `render`) the ESLint message all consume the same objects. No renderer parses
// a sentence, and no producer writes one.
//
// Entities compares all pairs SYMMETRICALLY ({a, b}), unlike utils' app/canonical
// asymmetry. The two sides are just A and B; there is no "canonical folder".

const { kindOf } = require("./vocabulary/labels");
const { render, kindOfCode } = require("./codes");
const { explain } = require("./explain");
const { CODE, KIND, SIDE, TIER } = require("../../constants");
const asks = require("../asks");

// An entity place: the report only needs where it is and what it is called.
const place = (entity) => ({
	name: entity?.name ?? null,
	path: entity?.sourceFile ?? entity?.path ?? null,
	line: entity?.line ?? null,
	endLine: entity?.endLine ?? entity?.line ?? null,
	kind: entity?.kind ?? null,
});

const conf = (value) => (Number.isFinite(value) ? value.toFixed(2) : "n/a");
const pct = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a");

const finding = ({ id, code, params, left, right = null, fix, decision = null, evidence = {}, dropped = null, members = null, suffix = "" }) => {
	const kind = kindOfCode(code) ?? KIND.Similar;
	const meta = kindOf(kind);

	return {
		id,
		code,
		params,
		kind,
		label: meta.label,
		color: meta.color,
		left,
		right,
		confidence: decision ? decision.confidence : null,
		tier: decision ? decision.tier : null,
		message: `${render(code, params)}${suffix}`,
		fix,
		decision,
		evidence,
		dropped,
		members,
	};
};

// The code for a tier: duplicate / extract / similar each have their own verdict.
const codeOfTier = (tier) => (tier === TIER.Duplicate ? CODE.Duplicate : tier === TIER.Extract ? CODE.Extract : CODE.Similar);

const pairFinding = (match) => {
	const decision = explain(match.decision);
	const code = codeOfTier(match.tier ?? match.decision.tier);
	const left = place(match.a);
	const right = place(match.b);
	const fix = code === CODE.Duplicate ? asks.useShared(left, right) : code === CODE.Extract ? asks.extractType(left, right, match.decision.shared ?? []) : asks.none();

	return finding({
		id: `${code}:${left.path}#${left.name}=>${right.path}#${right.name}`,
		code,
		params: {
			left: `\`${left.name}\``,
			right: `\`${right.name}\``,
			confidence: `${conf(decision.confidence)} (${pct(decision.confidence)})`,
		},
		left: { ...left, side: SIDE.A },
		right: { ...right, side: SIDE.B },
		fix,
		decision,
		evidence: { reason: match.reason },
	});
};

const droppedFinding = (dropped) => {
	const match = dropped.match ?? dropped;
	const decision = explain(match.decision);
	const left = place(match.a);
	const right = place(match.b);
	const why = dropped.reason ?? "";

	return finding({
		id: `dropped:${left.path}#${left.name}=>${right.path}#${right.name}`,
		code: CODE.FilteredOut,
		params: { left: `\`${left.name}\``, right: `\`${right.name}\``, reason: why },
		left: { ...left, side: SIDE.A },
		right: { ...right, side: SIDE.B },
		fix: asks.none(),
		decision,
		evidence: { filter: dropped.filter, reason: why },
		suffix: ` Filtered out by \`${dropped.filter ?? "filter"}\`: ${why}`,
		dropped: { filter: dropped.filter, reason: why },
	});
};

const clusterFinding = (cluster, index) => {
	const members = cluster.members ?? [];
	const weakest = (cluster.pairs ?? []).reduce((min, p) => Math.min(min, p.decision?.confidence ?? 1), 1);
	const names = members.map((m) => m.name).join(", ");

	return finding({
		id: `cluster:${index}:${members.map((m) => `${m.sourceFile}#${m.name}`).join("|")}`,
		code: CODE.Cluster,
		params: { count: members.length, confidence: `${conf(weakest)} (${pct(weakest)})` },
		left: place(members[0]),
		right: null,
		fix: asks.extractType(place(members[0]), place(members[1] ?? members[0]), []),
		decision: null,
		evidence: { names },
		members: members.map((m) => ({ ...place(m), side: SIDE.A })),
	});
};

// Every finding the run produced, in one flat list. The order is the reading
// order of the terminal report: verdicts (duplicate → extract → similar), then
// cross-file clusters, then what was filtered out.
const describeComp = (comp) => {
	const out = [];
	const order = { [TIER.Duplicate]: 0, [TIER.Extract]: 1, [TIER.Similar]: 2 };
	const matches = [...(comp.matches ?? [])].sort((a, b) => (order[a.tier] ?? 3) - (order[b.tier] ?? 3) || (b.decision?.confidence ?? 0) - (a.decision?.confidence ?? 0));
	for (const match of matches) out.push(pairFinding(match));
	(comp.clusters ?? []).forEach((cluster, i) => out.push(clusterFinding(cluster, i)));
	(comp.dropped ?? []).forEach((d) => out.push(droppedFinding(d)));

	return out;
};

module.exports = { describeComp, pairFinding, droppedFinding, clusterFinding, place, conf, pct };

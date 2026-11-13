"use strict";

// One explanation per pair, in the SAME shape the utils report uses, so the
// DecisionPanel, the signal pills and the CLI verdict rows read it unchanged.
//
// `decision` is what the entities `decide()` returned: it already carries
// `contributions` (the share of the verdict each signal produced) and
// `evidencing` (which identity signals had discriminating evidence). This module
// only turns those numbers into the reader's words — it never re-decides.
//
// It lives in the report (not the engine) so the entities decision-maker stays
// free of any report dependency; the UI only cares about the output shape.

const { SIGNALS } = require("./vocabulary/labels");
const { PHRASES, fill } = require("./vocabulary/phrases");
const { num, pct, showValue } = require("./vocabulary/format");
const { labelOfEvidence } = require("./vocabulary/evidence");
const { KIND, TIER, TONE } = require("../../constants");

const chips = (evidence) =>
	Object.entries(evidence ?? {})
		.filter(([, value]) => value !== undefined && value !== null)
		.map(([key, value]) => ({ key, label: labelOfEvidence(key), value: showValue(value) }));

// `decision.contributions` is the engine's own share-of-verdict per signal; when
// it is absent (a replayed log) fall back to weight × score over the total.
const contributionOf = (decision, key, totalWeight) => {
	if (decision.contributions && Number.isFinite(decision.contributions[key])) return decision.contributions[key];
	const score = decision.signals?.[key]?.score ?? 0;
	const weight = decision.weights?.[key] ?? 0;

	return (weight * score) / (totalWeight || 1);
};

const explain = (decision) => {
	const totalWeight = SIGNALS.reduce((sum, s) => sum + (decision.weights?.[s.key] ?? 0), 0) || 1;
	const evidencing = new Set(decision.evidencing ?? SIGNALS.map((s) => s.key));

	const rows = SIGNALS.map((signal) => {
		const sig = decision.signals?.[signal.key] ?? {};
		const score = sig.score ?? 0;
		const weight = decision.weights?.[signal.key] ?? 0;
		// A signal with no evidence for the pair is OFF: its weight was redistributed,
		// so it neither supports nor refutes the verdict. `name` is always on.
		const applied = sig.hasEvidence !== false && (signal.key === "name" || evidencing.has(signal.key));

		return {
			key: signal.key,
			label: signal.label,
			short: signal.short,
			color: signal.color,
			what: signal.what,
			score,
			weight,
			contribution: contributionOf(decision, signal.key, totalWeight),
			applied,
			evidence: chips(sig.evidence),
		};
	});

	const why = [];
	for (const row of [...rows].sort((a, b) => b.contribution - a.contribution)) {
		if (!row.applied) {
			why.push({ tone: TONE.Off, signal: row.key, text: fill(PHRASES.signalOff, { label: row.label }) });
			continue;
		}
		const template = row.score >= 0.6 ? PHRASES.signal : PHRASES.signalDisagrees;
		why.push({
			tone: row.score >= 0.6 ? TONE.Agree : TONE.Disagree,
			signal: row.key,
			text: fill(template, { label: row.label, score: num(row.score), weight: pct(row.weight), what: row.what }),
		});
	}

	const verdict = decision.tier === TIER.Duplicate ? KIND.Duplicate : decision.tier === TIER.Extract ? KIND.Extract : decision.tier === TIER.Similar ? KIND.Similar : "none";

	return {
		confidence: decision.confidence ?? 0,
		tier: decision.tier,
		verdict,
		thresholds: decision.thresholds ?? {},
		weights: decision.weights ?? {},
		vetoes: [],
		signals: rows,
		why,
		headline: (() => {
			const top = [...rows].sort((a, b) => b.contribution - a.contribution)[0];
			return fill(PHRASES.headline, { confidence: num(decision.confidence), top: top ? top.label : "—", share: pct(top ? top.contribution : 0) });
		})(),
	};
};

module.exports = { explain };

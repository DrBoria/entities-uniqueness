"use strict";

// SEMANTIC member links — WHAT corresponds, never WHERE.
//
// The model decides which member on the left is the same as which on the right
// (by name, and by type/signature for the key). It hands these to code-diff as
// `MemberLink`s; code-diff locates the names in the rows and computes the marks
// and twins. No character range is computed here — that is the view's job.

const { wordOf } = require("./word");

// One link per shared member of a model. `key` disambiguates members that share
// a name: a property pairs by name+type, a method by name+signature.
const memberLinks = (model, kind, label, keyOf) => {
	if (!model || !model.rows) return [];
	const links = [];
	for (const member of model.rows) {
		if (!member.shared) continue;
		links.push({
			connectionId: `same:${kind}:${member.name}`,
			label,
			tone: member.same === false ? "differs" : "same",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: member.name, key: keyOf ? keyOf(member.left) : member.name },
			right: { name: member.name, key: keyOf ? keyOf(member.right) : member.name },
		});
	}

	return links;
};

const propertyLinks = (model) => memberLinks(model, "property", wordOf("properties", model?.sharedCount ?? 0), (p) => `${p?.name ?? ""}:${p?.type ?? ""}`);

const methodLinks = (model) => memberLinks(model, "method", wordOf("methods", model?.sharedCount ?? 0), (m) => m?.name ?? "");

const signatureLinks = (model) => {
	if (!model || !model.rows) return [];
	return model.rows.map((row) => ({
		connectionId: `same:signature:${row.name}`,
		label: wordOf("signatures", model.sharedCount ?? 0),
		tone: row.same ? "same" : "differs",
		leftColumn: "0",
		rightColumn: "1",
		left: { name: row.name, key: row.left?.key ?? row.name },
		right: { name: row.name, key: row.right?.key ?? row.name },
	}));
};

// The entity NAME is one link over the declaration head; the shared bases are
// one link each. code-diff locates them on the head row.
const nameLinks = (model) => {
	if (!model || !model.hasEvidence) return [];
	const share = model.score;
	const label = share >= 1 ? wordOf("entity names", 1) : `${wordOf("entity names", 1)} · ${Math.round(share * 100)}%`;

	return [
		{
			connectionId: "same:name",
			label,
			leftColumn: "0",
			rightColumn: "1",
			left: { name: model.left.name },
			right: { name: model.right.name },
		},
	];
};

const inheritanceLinks = (model) => {
	if (!model || !model.hasEvidence || model.shared.length === 0) return [];
	const label = wordOf("shared bases", model.shared.length);

	return model.shared.map((base) => ({
		connectionId: `same:inheritance:${base}`,
		label,
		leftColumn: "0",
		rightColumn: "1",
		left: { name: base },
		right: { name: base },
	}));
};

// All links per signal, keyed by the SIGNAL the tab selects.
const linksBySignal = (analysis) => ({
	properties: propertyLinks(analysis.properties),
	methods: methodLinks(analysis.methods),
	signature: signatureLinks(analysis.signature),
	name: nameLinks(analysis.name),
	inheritance: inheritanceLinks(analysis.inheritance),
});

module.exports = { linksBySignal, propertyLinks, methodLinks, signatureLinks, nameLinks, inheritanceLinks };

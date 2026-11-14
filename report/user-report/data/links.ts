"use strict";

// SEMANTIC member links — WHAT corresponds, never WHERE the characters are.
//
// The model decides which member on the left is the same as which on the right
// (by name, and by type/signature for the key). It hands these to code-diff as
// `MemberLink`s; code-diff locates the names in the rows and computes the marks
// and twins. No character range is computed here — that is the view's job.
//
// The model DOES know the declaration LINE of each member (the parser reported
// it), so it passes that as a hint: the view anchors the highlight on the
// declaration, not on an earlier mention of the same word in a doc comment. And
// each signal highlights a DIFFERENT part of the member, so the Methods tab and
// the Signature tab are not the same picture:
//
//   properties   the property name on its declaration line
//   methods      the method NAME
//   signature    the method's PARAMETER LIST / return type (not the name)
//   values       the value leaves
//   inheritance  the extends / implements bases, and the alias target

import { wordOf } from "./word";

// One link per shared member of a model. `key` disambiguates members that share
// a name: a property pairs by name+type, a method by name+signature. `line` is
// the declaration line the parser reported (the view's anchor hint).
const memberLinks = (model, kind, label, keyOf, nameOf?) => {
	if (!model || !model.rows) return [];
	const links = [];
	for (const member of model.rows) {
		if (!member.shared) continue;
		const leftName = nameOf ? nameOf(member.left, member) : member.name;
		const rightName = nameOf ? nameOf(member.right, member) : member.name;
		if (!leftName || !rightName) continue;
		links.push({
			connectionId: `same:${kind}:${member.name}`,
			label,
			tone: member.same === false ? "differs" : "same",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: leftName, key: keyOf ? keyOf(member.left) : member.name, ...(member.left?.line ? { line: member.left.line } : {}) },
			right: { name: rightName, key: keyOf ? keyOf(member.right) : member.name, ...(member.right?.line ? { line: member.right.line } : {}) },
		});
	}

	return links;
};

const propertyLinks = (model) => memberLinks(model, "property", wordOf("properties", model?.sharedCount ?? 0), (p) => `${p?.name ?? ""}:${p?.type ?? ""}`);

// Methods: highlight the method NAME on its declaration line.
const methodLinks = (model) => memberLinks(model, "method", wordOf("methods", model?.sharedCount ?? 0), (m) => m?.name ?? "");

// Signature: highlight the PARAMETER LIST (the first parameter, or the return
// type when there are no parameters) — a DIFFERENT range than the method name, so
// the Signature tab is not a copy of the Methods tab. The entity name is linked
// too (a name is part of a signature).
//
// The anchor must be a word that actually appears in the source line. A parameter
// name is such a word; a canonical return type may carry an `import("…")` prefix
// and array/generic markers, so it is reduced to its base identifier.
const returnTypeName = (returnType) => {
	if (!returnType || returnType === "void") return null;
	// Strip import("…"). prefixes, then array/generic/union decorations, and take
	// the last identifier-like token (the type's own name).
	const cleaned = String(returnType).replace(/import\("[^"]*"\)\.?/g, "");
	const match = cleaned.match(/[A-Za-z_$][\w$]*/g);
	if (!match || match.length === 0) return null;

	return match[match.length - 1];
};

const signaturePart = (m) => {
	if (!m) return null;
	const params = m.params ?? [];
	if (params.length > 0) return params[0];

	return returnTypeName(m.returnType);
};

const signatureLinks = (model) => {
	if (!model || !model.rows) return [];
	const links = [];
	for (const row of model.rows) {
		const leftPart = signaturePart(row.left);
		const rightPart = signaturePart(row.right);
		if (!leftPart || !rightPart) continue;
		links.push({
			connectionId: `same:signature:${row.name}`,
			label: wordOf("signatures", model.sharedCount ?? 0),
			tone: row.same ? "same" : "differs",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: leftPart, key: row.left?.key ?? row.name, ...(row.left?.line ? { line: row.left.line } : {}) },
			right: { name: rightPart, key: row.right?.key ?? row.name, ...(row.right?.line ? { line: row.right.line } : {}) },
		});
	}
	// The entity names themselves (the declaration heads) — part of the signature.
	if (model.name && model.name.hasEvidence) {
		links.push({
			connectionId: "same:signature:name",
			label: wordOf("entity names", 1),
			tone: model.name.score >= 1 ? "same" : "differs",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: model.name.left.name },
			right: { name: model.name.right.name },
		});
	}

	return links;
};

// Values: one link per shared value leaf, anchored on the value's path tail (the
// key or index the value sits under). A renamed copy lights up every leaf.
const valuesLinks = (model) => {
	if (!model || !model.rows) return [];
	const label = wordOf("values", model.sharedCount ?? 0);
	const links = [];
	for (const row of model.rows) {
		if (!row.shared) continue;
		// The last path segment is the word the value is written under.
		const tail = String(row.name).split(".").pop().replace(/\[\d+\]$/, "");
		const leftText = row.left?.text;
		const rightText = row.right?.text;
		if (!leftText || !rightText) continue;
		links.push({
			connectionId: `same:value:${row.name}`,
			label,
			tone: row.same ? "same" : "differs",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: tail || leftText, key: row.name },
			right: { name: tail || rightText, key: row.name },
		});
	}

	return links;
};

const inheritanceLinks = (model, leftEntity, rightEntity) => {
	if (!model || !model.hasEvidence) return [];
	const links = [];
	// The alias fact: the alias name on one side, the target name on the other.
	// `aliasFact` orients the pair either way (the alias may be the LEFT or the
	// RIGHT entity), so place each name on the column of the entity that owns it —
	// otherwise the link points at words that are not in that column and no ribbon
	// is drawn.
	if (model.alias) {
		const aliasIsLeft = leftEntity && model.alias.alias === leftEntity.name;
		const leftName = aliasIsLeft ? model.alias.alias : model.alias.target;
		const rightName = aliasIsLeft ? model.alias.target : model.alias.alias;
		links.push({
			connectionId: "same:inheritance:alias",
			label: "alias",
			tone: "same",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: leftName },
			right: { name: rightName },
		});
	}
	if (model.shared.length > 0) {
		const label = wordOf("shared bases", model.shared.length);
		for (const base of model.shared) {
			links.push({
				connectionId: `same:inheritance:${base}`,
				label,
				leftColumn: "0",
				rightColumn: "1",
				left: { name: base },
				right: { name: base },
			});
		}
	}

	return links;
};

// All links per signal, keyed by the SIGNAL the tab selects.
const linksBySignal = (analysis, leftEntity, rightEntity) => ({
	properties: propertyLinks(analysis.properties),
	methods: methodLinks(analysis.methods),
	signature: signatureLinks(analysis.signature),
	values: valuesLinks(analysis.values),
	inheritance: inheritanceLinks(analysis.inheritance, leftEntity, rightEntity),
});

export {  linksBySignal, propertyLinks, methodLinks, signatureLinks, valuesLinks, inheritanceLinks  };

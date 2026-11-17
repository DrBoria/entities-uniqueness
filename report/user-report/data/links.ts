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
import { valuesLinks } from "./values-links";
import { typesAgree } from "../../../matcher/type-key";

// THE COLOR MODEL: a correspondence is a DUPLICATE — red, with the percent it
// is a duplicate at. No percent = 100%. Green is reserved for a member that
// exists on ONE side only (100% unique), drawn as a stub lane.
const pctLabel = (word, degree) => (degree >= 1 ? word : `${word} · ${Math.round(degree * 100)}%`);

// One link per member of a model. Shared members are red at their degree;
// one-sided members are green stubs (the absent side's name simply does not
// locate, so resolveLanes keeps one end). `line` is the declaration line the
// parser reported (the view's anchor hint).
const memberLinks = (model, kind, word, keyOf, degreeOf) => {
	if (!model || !model.rows) return [];
	const links = [];
	for (const member of model.rows) {
		const leftName = member.left?.name ?? member.name;
		const rightName = member.right?.name ?? member.name;
		if (!leftName || !rightName) continue;
		const shared = member.shared === true;
		links.push({
			connectionId: `same:${kind}:${member.name}`,
			label: shared ? pctLabel(word, degreeOf(member)) : word,
			tone: shared ? "same" : "differs",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: leftName, key: keyOf && member.left ? keyOf(member.left) : leftName, ...(member.left?.line ? { line: member.left.line } : {}) },
			right: { name: rightName, key: keyOf && member.right ? keyOf(member.right) : rightName, ...(member.right?.line ? { line: member.right.line } : {}) },
		});
	}

	return links;
};

// A property pairs on two facts: its name and its type. Name shared + type
// shared = 100%; name shared + type differs = 50% — a partial duplicate, red.
const propertyLinks = (model) => memberLinks(model, "property", wordOf("properties", 1), (p) => `${p?.name ?? ""}:${p?.type ?? ""}`, (m) => (m.same ? 1 : 0.5));

// Methods: highlight the method NAME on its declaration line. A near-miss
// rename (`fetchTicket` ↔ `fetchTirket`) is a partial duplicate at its edit
// similarity — red with that percent; each side anchors its own spelling.
// A method on one side only is a green stub (unique).
const methodLinks = (model) => {
	if (!model || !model.rows) return [];
	const links = [];
	for (const member of model.rows) {
		const leftName = member.left?.name ?? member.name;
		const rightName = member.right?.name ?? member.name;
		if (!leftName || !rightName) continue;
		const shared = member.shared === true;
		links.push({
			connectionId: `same:method:${member.name}`,
			label: shared ? pctLabel(wordOf("methods", 1), member.sim ?? 1) : wordOf("methods", 1),
			tone: shared ? "same" : "differs",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: leftName, key: leftName, ...(member.left?.line ? { line: member.left.line } : {}) },
			right: { name: rightName, key: rightName, ...(member.right?.line ? { line: member.right.line } : {}) },
		});
	}

	return links;
};

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

// A signature's degree: the fraction of its shape facts (each parameter type
// position + the return type) that agree. All agree = 100% (no percent shown).
const signatureDegree = (row) => {
	if (row.same) return 1;
	const ta = row.left?.paramTypes ?? row.left?.params ?? [];
	const tb = row.right?.paramTypes ?? row.right?.params ?? [];
	const total = Math.max(ta.length, tb.length) + 1;
	let hit = typesAgree(row.left?.returnType ?? "void", row.right?.returnType ?? "void") ? 1 : 0;
	for (let i = 0; i < Math.min(ta.length, tb.length); i += 1) if (typesAgree(ta[i], tb[i])) hit += 1;

	return hit / total;
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
			label: pctLabel(wordOf("signatures", 1), signatureDegree(row)),
			tone: "same",
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
			label: pctLabel(wordOf("entity names", 1), model.name.score),
			tone: "same",
			leftColumn: "0",
			rightColumn: "1",
			left: { name: model.name.left.name },
			right: { name: model.name.right.name },
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
				tone: "same",
				leftColumn: "0",
				rightColumn: "1",
				left: { name: base },
				right: { name: base },
			});
		}
	}

	return links;
};

// All links per signal, keyed by the SIGNAL the tab selects. Values links need
// the raw source spans to resolve each leaf's declaration line.
const linksBySignal = (analysis, leftEntity, rightEntity, spans: { left?: any; right?: any } = {}) => ({
	properties: propertyLinks(analysis.properties),
	methods: methodLinks(analysis.methods),
	signature: signatureLinks(analysis.signature),
	values: valuesLinks(analysis.values, spans.left, spans.right),
	inheritance: inheritanceLinks(analysis.inheritance, leftEntity, rightEntity),
});

export {  linksBySignal, propertyLinks, methodLinks, signatureLinks, valuesLinks, inheritanceLinks  };

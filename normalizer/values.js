"use strict";

// The VALUES an entity stands for. An `enum` is a set of values with names on
// them; `type X = "a" | "b"` is the same set without names — one shape spelled
// twice. Both record the tokens the parser actually wrote, so the two can be
// compared without either pretending to be the other.

const { SyntaxKind } = require("ts-morph");

const call = (node, method, ...args) => (typeof node[method] === "function" ? node[method](...args) : undefined);
const nodeKind = (node) => (node && typeof node.getKind === "function" ? node.getKind() : null);

// `"pending"` → pending, `1` → 1, `'a'` → a. A quoted token and its value are
// the same value, and an enum member holding it is the same member.
const token = (text) => String(text ?? "").trim().replace(/^(['"])(.*)\1$/s, "$2");

const LITERAL_NODES = new Set([SyntaxKind.StringLiteral, SyntaxKind.NumericLiteral, SyntaxKind.TrueKeyword, SyntaxKind.FalseKeyword, SyntaxKind.NullKeyword]);

// A literal in a union arrives wrapped: `"a" | "b"` is two `LiteralType`s, each
// holding the literal. Anything that is not a plain literal — `string`, an
// object, a type reference — means the union is not a closed set of values, and
// the answer is no values at all.
const literalOf = (part) => {
	const k = nodeKind(part);
	if (k === SyntaxKind.LiteralType) {
		const lit = call(part, "getLiteral");
		if (lit && LITERAL_NODES.has(nodeKind(lit))) return token(lit.getText());
		return null;
	}
	if (LITERAL_NODES.has(k)) return token(part.getText());

	return null;
};

const unionValues = (typeNode) => {
	if (nodeKind(typeNode) !== SyntaxKind.UnionType) return [];
	const parts = call(typeNode, "getTypeNodes") || [];
	const out = [];
	for (const part of parts) {
		const value = literalOf(part);
		if (value == null) return [];
		out.push(value);
	}

	return out;
};

module.exports = { token, unionValues };

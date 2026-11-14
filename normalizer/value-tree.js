"use strict";

// The VALUE TREE of an initializer: what the entity stands for, value by value.
//
// The shape matchers compare names and types; two objects can share a shape and
// hold completely different values, or hold the SAME values under different
// names (a renamed copy). This module records the initializer as a tree so the
// values matcher can deep-compare it:
//
//   { kind: "primitive", value }        a string / number / boolean / null
//   { kind: "array", items: [...] }     order matters
//   { kind: "object", entries: {...} }  key order does NOT matter
//   { kind: "function" }                a marker — bodies are never compared
//   { kind: "opaque", text }            anything else (a reference, a call, a
//                                       template with holes): compared by its
//                                       normalized source text, never evaluated
//
// The tree is data, not code: it is safe to serialize into the catalog.

const { SyntaxKind } = require("ts-morph");

const call = (node, method, ...args) => (node && typeof node[method] === "function" ? node[method](...args) : undefined);
const nodeKind = (node) => (node && typeof node.getKind === "function" ? node.getKind() : null);

// A depth cap keeps a pathological literal from producing an unbounded tree.
const MAX_DEPTH = 12;

const primitiveOf = (node) => {
	const k = nodeKind(node);
	if (k === SyntaxKind.StringLiteral || k === SyntaxKind.NoSubstitutionTemplateLiteral) return { kind: "primitive", value: `s:${call(node, "getLiteralValue") ?? call(node, "getText")}` };
	if (k === SyntaxKind.NumericLiteral) return { kind: "primitive", value: `n:${call(node, "getText")}` };
	if (k === SyntaxKind.TrueKeyword) return { kind: "primitive", value: "b:true" };
	if (k === SyntaxKind.FalseKeyword) return { kind: "primitive", value: "b:false" };
	if (k === SyntaxKind.NullKeyword) return { kind: "primitive", value: "null" };

	return null;
};

// Strip the assertion wrappers (`as const`, `satisfies X`, parens) — the value
// is what stands under them.
const unwrap = (node) => {
	let n = node;
	for (let i = 0; i < 8 && n; i += 1) {
		const k = nodeKind(n);
		if (k === SyntaxKind.ParenthesizedExpression || k === SyntaxKind.AsExpression || k === SyntaxKind.SatisfiesExpression || k === SyntaxKind.TypeAssertionExpression) {
			n = call(n, "getExpression");
			continue;
		}
		break;
	}

	return n;
};

const buildTree = (node, depth = 0) => {
	const n = unwrap(node);
	if (!n || depth > MAX_DEPTH) return { kind: "opaque", text: String(call(node, "getText") ?? "").replace(/\s+/g, " ").trim() };

	const prim = primitiveOf(n);
	if (prim) return prim;

	const k = nodeKind(n);
	if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression || k === SyntaxKind.MethodDeclaration) return { kind: "function" };

	if (k === SyntaxKind.ArrayLiteralExpression) {
		const items = (call(n, "getElements") || []).map((el) => buildTree(el, depth + 1));

		return { kind: "array", items };
	}

	if (k === SyntaxKind.ObjectLiteralExpression) {
		const entries = {};
		for (const member of call(n, "getProperties") || []) {
			const name = call(member, "getName");
			if (!name) continue;
			if (call(member, "isMethodDeclaration")) {
				entries[name] = { kind: "function" };
				continue;
			}
			if (call(member, "isShorthandPropertyAssignment")) {
				// `{ x }` stands for the value of `x` — a reference, not a literal.
				entries[name] = { kind: "opaque", text: `ref:${name}` };
				continue;
			}
			if (call(member, "isSpreadAssignment")) {
				entries[`…${call(member, "getExpression") ? String(call(call(member, "getExpression"), "getText")).replace(/\s+/g, " ").trim() : ""}`] = { kind: "opaque", text: "spread" };
				continue;
			}
			const initializer = call(member, "getInitializer");
			entries[name] = initializer ? buildTree(initializer, depth + 1) : { kind: "opaque", text: "undefined" };
		}

		return { kind: "object", entries };
	}

	// A reference, a call, a template with holes, a binary expression: compare by
	// normalized text. Two `process.env.X` reads are the same value; two different
	// calls are not.
	return { kind: "opaque", text: String(call(n, "getText") ?? "").replace(/\s+/g, " ").trim() };
};

module.exports = { buildTree };
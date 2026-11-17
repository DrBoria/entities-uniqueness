"use strict";

// Canonical MST member types — shared by the model extractor (mst.ts) and the
// composition-chain extractor (mst-chain.ts). `t.boolean` → "boolean",
// `t.maybeNull(X)` → "X?", `t.array(X)` → "X[]", `t.late(() => X)` → "X",
// `t.frozen<T>()` / `passthrough<T>()` → "T".

import { SyntaxKind } from "ts-morph";

const call = (node, method, ...args) => (node && typeof node[method] === "function" ? node[method](...args) : undefined);

const PRIMITIVE_BUILDERS = new Set(["boolean", "string", "number", "Date", "integer"]);

const UNARY_BUILDERS = new Map([
	["optional", (inner) => `${inner}?`],
	["maybeNull", (inner) => `${inner}?`],
	["maybe", (inner) => `${inner}?`],
	["nullable", (inner) => `${inner}?`],
	["array", (inner) => `${inner}[]`],
	["late", (inner) => inner],
]);

/** The builder name of a call/property-access (`t.array(...)` → "array"). */
const builderName = (expr) => {
	if (!expr) return null;
	if (expr.getKind() === SyntaxKind.PropertyAccessExpression) return call(expr, "getName");
	if (expr.getKind() === SyntaxKind.Identifier) return expr.getText();

	return null;
};

const canonicalMemberType = (initializer) => {
	const k = initializer.getKind();

	if (k === SyntaxKind.Identifier || k === SyntaxKind.PropertyAccessExpression) {
		const name = builderName(initializer);
		if (PRIMITIVE_BUILDERS.has(name)) return name;
	}

	if (k === SyntaxKind.CallExpression) {
		const name = builderName(call(initializer, "getExpression"));
		const args = call(initializer, "getArguments") || [];

		if (name && PRIMITIVE_BUILDERS.has(name) && args.length === 0) return name;
		if (name && UNARY_BUILDERS.has(name) && args.length >= 1) {
			// `t.late(() => TreeNode)` — the thunk's body names the recursive type.
			let innerNode = args[0];
			if (name === "late" && innerNode.getKind() === SyntaxKind.ArrowFunction) {
				const body = call(innerNode, "getBody");
				innerNode = body && body.getKind() === SyntaxKind.Identifier ? body : innerNode;
			}
			const inner = innerNode.getKind() === SyntaxKind.Identifier ? innerNode.getText() : canonicalMemberType(innerNode);

			return UNARY_BUILDERS.get(name)(inner || "object");
		}
		const typeArgs = call(initializer, "getTypeArguments") || [];
		if (typeArgs.length) {
			const ta = typeArgs[0];
			const ref = ta.getKind() === SyntaxKind.TypeReference ? call(ta, "getText") : null;

			return ref || "object";
		}
		// `t.enumeration(["a","b"])` — the literal union of its members.
		if (name === "enumeration" && args[0] && args[0].getKind() === SyntaxKind.ArrayLiteralExpression) {
			const vals = (call(args[0], "getElements") || []).map((el) => call(el, "getText")).filter(Boolean);
			if (vals.length) return [...new Set(vals)].sort().join("|");
		}
	}

	const text = initializer.getText();

	return text.replace(/\s+/g, " ").trim() || "object";
};

export { canonicalMemberType, PRIMITIVE_BUILDERS, UNARY_BUILDERS };

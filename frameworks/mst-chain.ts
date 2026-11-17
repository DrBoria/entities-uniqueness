"use strict";

// MST COMPOSITION — `types.compose("Name", A, B, C)` and chained
// `.props({...}).views(self => ({...})).actions(self => ({...}))`.
//
// MST has no class inheritance: a model is COMPOSED from base models and
// extended by chaining. The composed model's heritage is its base models
// (so the inheritance matcher sees the reuse), its properties are the union
// of every `.props` object in the chain, its views are read-only properties
// (getters) and its actions are methods. `types.compose` bases are named
// identifiers resolved against the file's own models first.

import { SyntaxKind } from "ts-morph";
import { canonicalMemberType } from "./mst-types";

const call = (node, method, ...args) => (node && typeof node[method] === "function" ? node[method](...args) : undefined);

/** The variable a call expression is bound to (`const X = ...`), or null. */
const boundName = (node) => {
	let parent = node;
	while (parent && typeof parent.getParent === "function") {
		const p = parent.getParent();
		if (!p) return null;
		if (p.getKind() === SyntaxKind.VariableDeclaration) {
			const nn = call(p, "getNameNode");
			return nn && nn.getKindName() === "Identifier" ? nn.getText() : null;
		}
		if (p.getKind() === SyntaxKind.VariableStatement) return null;
		parent = p;
	}

	return null;
};

/** Walk a property-access chain down to its root call (`t.model`/`t.compose`). */
const chainRoot = (node) => {
	let cur = node;
	while (cur && cur.getKind() === SyntaxKind.CallExpression) {
		const expr = call(cur, "getExpression");
		if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return cur;
		cur = call(expr, "getExpression");
	}

	return cur && cur.getKind() === SyntaxKind.CallExpression ? cur : null;
};

/** The outermost call of a chain starting at any inner call (walk UP through
 *  `.props/.views/.actions` wrappers until the parent is no longer one). */
const chainTop = (node) => {
	let top = node;
	let parent = call(top, "getParent");
	while (parent) {
		if (parent.getKind() === SyntaxKind.PropertyAccessExpression) {
			const name = call(parent, "getName");
			const grand = call(parent, "getParent");
			if ((name === "props" || name === "views" || name === "actions") && grand && grand.getKind() === SyntaxKind.CallExpression) {
				top = grand;
				parent = call(top, "getParent");
				continue;
			}
		}
		break;
	}

	return top;
};

/** The ordered `.props/.views/.actions` segments of a chain, root-first. */
const chainSegments = (node) => {
	const segs = [];
	let cur = node;
	while (cur && cur.getKind() === SyntaxKind.CallExpression) {
		const expr = call(cur, "getExpression");
		if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) break;
		const name = call(expr, "getName");
		if (name === "props" || name === "views" || name === "actions") segs.unshift({ kind: name, node: cur });
		cur = call(expr, "getExpression");
	}

	return segs;
};

/** Members of a `.props({...})` object literal → canonical properties. */
const propsOf = (objectLiteral) => {
	const out = [];
	for (const prop of call(objectLiteral, "getProperties") || []) {
		if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
		const name = call(prop, "getName");
		const init = call(prop, "getInitializer");
		if (!name || !init) continue;
		out.push({ name, type: canonicalMemberType(init) });
	}

	return out;
};

/** The object a `.views/.actions(self => ({...}))` arrow returns. */
const returnedObject = (segmentNode) => {
	const arg = (call(segmentNode, "getArguments") || [])[0];
	if (!arg) return null;
	if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) return arg;
	if (arg.getKind() !== SyntaxKind.ArrowFunction) return null;
	const body = call(arg, "getBody");
	if (!body) return null;
	if (body.getKind() === SyntaxKind.ObjectLiteralExpression) return body;
	if (body.getKind() === SyntaxKind.ParenthesizedExpression) {
		const inner = call(body, "getExpression");
		return inner && inner.getKind() === SyntaxKind.ObjectLiteralExpression ? inner : null;
	}
	// Block body: `return {...}`.
	for (const stmt of call(body, "getStatements") || []) {
		if (stmt.getKind() !== SyntaxKind.ReturnStatement) continue;
		const expr = call(stmt, "getExpression");
		if (expr && expr.getKind() === SyntaxKind.ObjectLiteralExpression) return expr;
	}

	return null;
};

/** Views → read-only properties (getters) or plain value members. */
const viewsOf = (objectLiteral) => {
	const out = [];
	for (const member of call(objectLiteral, "getProperties") || []) {
		const kind = member.getKind();
		const name = call(member, "getName");
		if (!name) continue;
		if (kind === SyntaxKind.GetAccessor) {
			const rt = call(member, "getReturnType");
			out.push({ name, type: rt ? call(rt, "getText") : "object", readonly: true });
		} else if (kind === SyntaxKind.PropertyAssignment) {
			const init = call(member, "getInitializer");
			out.push({ name, type: init ? canonicalMemberType(init) : "object", readonly: true });
		}
	}

	return out;
};

/** Actions → methods (name + parameter names; bodies are never compared). */
const actionsOf = (objectLiteral) => {
	const out = [];
	for (const member of call(objectLiteral, "getProperties") || []) {
		const kind = member.getKind();
		const name = call(member, "getName");
		if (!name) continue;
		if (kind === SyntaxKind.MethodDeclaration || kind === SyntaxKind.PropertyAssignment) {
			const fn = kind === SyntaxKind.MethodDeclaration ? member : call(member, "getInitializer");
			const params = (call(fn, "getParameters") || []).map((p) => call(p, "getName") || "");
			out.push({ name, params, returnType: "void" });
		}
	}

	return out;
};

export { boundName, chainRoot, chainTop, chainSegments, propsOf, returnedObject, viewsOf, actionsOf };

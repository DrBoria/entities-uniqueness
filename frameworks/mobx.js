"use strict";

// MobX normalizer.
//
// The base normalizer only sees top-level object literals and factory functions.
// MobX stores are usually `const store = makeAutoObservable({ ... })` — a call
// expression, either top-level or nested inside a factory function (the common
// `createCLIStore()` shape). This normalizer walks the AST for those calls and
// turns each into a UnifiedEntity of kind "object" whose properties carry the
// canonical field type.
//
// The set of store-builder call names is derived from the real mobx package,
// not a hardcoded word list.

const mobx = require("mobx");
const { SyntaxKind } = require("ts-morph");
const { objectLiteralMembers } = require("../normalizer/index.js");

// Store builders: mobx exports whose name is a builder that takes an object
// literal (makeAutoObservable, makeObservable, observable, observableShallow,
// extendObservable, ...). Derived from the package so renames/additions are
// picked up automatically.
const STORE_CALLS = new Set(
  Object.keys(mobx).filter((k) => /^(makeAutoObservable|makeObservable|observable\w*|extendObservable)$/.test(k))
);

const detect = (text) =>
  /from\s*["']mobx["']/.test(text) || [...STORE_CALLS].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));

// Find every `name = makeAutoObservable({ ... })` binding in the file.
const findStores = (sourceFile) => {
	const out = [];
	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.CallExpression) return;
		const expr = node.getExpression();
		if (!expr || expr.getKind() !== SyntaxKind.Identifier) return;
		const callee = expr.getText();
		if (!STORE_CALLS.has(callee)) return;
		const args = node.getArguments();
		if (!args.length || args[0].getKind() !== SyntaxKind.ObjectLiteralExpression) return;

		// The store is bound to the enclosing variable declarator.
		let parent = node;
		let name = null;
		while (parent && typeof parent.getParent === "function") {
			const p = parent.getParent();
			if (!p) break;
			if (p.getKind() === SyntaxKind.VariableDeclaration) {
				const nn = typeof p.getNameNode === "function" ? p.getNameNode() : null;
				if (nn && nn.getKindName() === "Identifier") name = nn.getText();
				break;
			}
			if (p.getKind() === SyntaxKind.VariableStatement) break;
			parent = p;
		}
		if (name) out.push({ name, objectLiteral: args[0], node });
	});

	return out;
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	if (!sourceFile) return entities;

	const stores = findStores(sourceFile);
	if (stores.length === 0) return entities;

	const out = entities.filter((e) => e.framework !== "mobx");
	const seen = new Set();

	for (const { name, objectLiteral, node } of stores) {
		const properties = objectLiteralMembers(objectLiteral);
		if (properties.length === 0) continue;
		const line = node.getStartLineNumber();
		const endLine = node.getEndLineNumber();
		const key = `${sourceFile.getFilePath()}|${line}|${name}`;
		if (seen.has(key)) continue;
		seen.add(key);

		out.push({
			id: `${sourceFile.getFilePath()}#${name}`,
			name,
			kind: "object",
			sourceFile: sourceFile.getFilePath(),
			line,
			endLine,
			exported: false,
			properties,
			methods: [],
			constructors: [],
			extends: null,
			implements: [],
			uses: [],
			imports: [...ctx.imports],
			framework: "mobx",
			complexity: properties.length,
		});
	}

	return out;
};

module.exports = { id: "mobx", detect, normalize, STORE_CALLS };

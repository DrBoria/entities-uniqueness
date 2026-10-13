"use strict";

// Zustand normalizer — tags entities built with `create` from "zustand" and
// extracts the store state shape (the object literal / returned object) as
// properties, so two stores with the same state compare meaningfully.
//
// The set of store-creator names is derived from the real zustand package.

const zustand = require("zustand");
const { SyntaxKind } = require("ts-morph");
const { objectLiteralMembers } = require("../normalizer");

// Store creators exported by zustand: create, createStore, useStore.
const CREATE_CALLS = new Set(Object.keys(zustand).filter((k) => /^(create|createStore|useStore)$/.test(k)));

const detect = (text) => /from\s*["']zustand["']/.test(text);

// Find the local name bound to a zustand store-creator export, e.g. `create`
// in `import { create } from "zustand"` or `makeStore` in
// `import { create as makeStore } from "zustand"`.
const findCreateName = (sourceFile) => {
	for (const imp of sourceFile.getImportDeclarations()) {
		const spec = imp.getModuleSpecifier();
		const moduleText = spec ? spec.getText().replace(/^["']|["']$/g, "") : "";
		if (moduleText !== "zustand") continue;
		const clause = imp.getImportClause();
		if (!clause) continue;
		for (const el of clause.getNamedImports()) {
			const imported = el.getName();
			if (!CREATE_CALLS.has(imported)) continue;
			const text = el.getText();
			const as = text.match(/\bas\s+([\w$]+)$/);
			return as ? as[1] : imported;
		}
	}
	return null;
};

// Find the first object literal inside a create(...) call (covers both
// create({...}) and create(() => ({...}))).
const stateShape = (node) => {
	const out = [];
	node.forEachDescendant((n) => {
		if (n.getKind() === SyntaxKind.ObjectLiteralExpression) {
			for (const p of objectLiteralMembers(n)) out.push(p);
		}
	});
	return out;
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	const createName = findCreateName(sourceFile);
	if (!createName) return entities;

	const out = entities.map((e) =>
		e.uses.includes(createName) || e.imports.includes(createName) ? { ...e, framework: e.framework || "zustand" } : e
	);

	for (const stmt of sourceFile.getStatements()) {
		let node = stmt;
		if (node.getKind() === SyntaxKind.ExportDeclaration) {
			const inner = typeof node.getStatement === "function" ? node.getStatement() : null;
			if (inner) node = inner;
		}
		if (node.getKind() !== SyntaxKind.VariableStatement) continue;
		const decls = typeof node.getDeclarationList === "function" ? node.getDeclarationList().getDeclarations() : [];
		for (const decl of decls) {
			const nn = typeof decl.getNameNode === "function" ? decl.getNameNode() : null;
			if (!nn || nn.getKindName() !== "Identifier") continue;
			const name = nn.getText();
			const init = typeof decl.getInitializer === "function" ? decl.getInitializer() : null;
			if (!init || init.getKind() !== SyntaxKind.CallExpression) continue;
			const expr = init.getExpression();
			if (!expr || expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== createName) continue;
			const props = stateShape(init);
			if (props.length === 0) continue;
			const line = decl.getStartLineNumber();
			const endLine = decl.getEndLineNumber();
			out.push({
				id: `${sourceFile.getFilePath()}#${name}`,
				name,
				kind: "store",
				sourceFile: sourceFile.getFilePath(),
				line,
				endLine,
				exported: /export/.test(stmt.getText()),
				properties: props,
				methods: [],
				constructors: [],
				extends: null,
				implements: [],
				uses: [],
				imports: [...ctx.imports],
				framework: "zustand",
				complexity: props.length,
			});
		}
	}

	return out;
};

module.exports = { id: "zustand", detect, normalize };

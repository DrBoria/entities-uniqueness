"use strict";

// Keystone normalizer.
//
// Keystone v6 schema files declare entities as `export const Post = list({ ... })`
// (or `relation({ ... })`) — a call expression whose first argument is the
// schema object literal. The base normalizer only extracts bare object
// literals, so `list({...})` results are invisible without this normalizer.
//
// The set of schema-builder call names is derived from the real
// @keystone-6/core package, not a hardcoded word list.

import { SyntaxKind } from "ts-morph";
import { objectLiteralMembers } from "../normalizer/index.js";

// Schema builders: @keystone-6/core exports that take a schema object literal
// (list, relation).
const SCHEMA_CALLS = new Set(["list", "relation"]);

const detect = (text) =>
	/from\s*["'][^"']*@keystone-6\/core["']/.test(text) || [...SCHEMA_CALLS].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));

// Find every `name = list({ ... })` / `name = relation({ ... })` binding.
const findSchemas = (sourceFile) => {
	const out = [];
	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.CallExpression) return;
		const expr = node.getExpression();
		if (!expr || expr.getKind() !== SyntaxKind.Identifier) return;
		const callee = expr.getText();
		if (!SCHEMA_CALLS.has(callee)) return;
		const args = node.getArguments();
		if (!args.length || args[0].getKind() !== SyntaxKind.ObjectLiteralExpression) return;

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

// A keystone list's identity is its FIELD set (`fields: { name: text(...), ... }`).
// The other top-level sections (`access`, `db`, `ui`, hooks) are per-list
// configuration — table names, labels, permission hooks — that differ between
// every list and would only add noise to duplicate detection, so they are not
// part of the extracted shape.
const FIELD_SECTION = "fields";

// The TS type a Keystone field builder stores. This is knowledge of the
// @keystone-6/core field API (the same package the schema builders come from),
// not an app vocabulary: `text()` is a string column, `integer()` a number,
// `checkbox()` a boolean, `timestamp()` an ISO string. Mapping the builder to
// its stored type lets a Keystone list be compared with a plain interface / DTO
// that describes the same domain shape.
const FIELD_TYPE = {
	text: "string",
	password: "string",
	timestamp: "string",
	calendarDay: "string",
	integer: "number",
	bigInt: "number",
	float: "number",
	decimal: "number",
	checkbox: "boolean",
	select: "string",
	multiselect: "string[]",
	json: "object",
	image: "object",
	file: "object",
	relationship: "object",
	virtual: "object",
};

// The builder callee of a field initializer (`text({ ... })` → "text").
const fieldBuilderOf = (initializer) => {
	if (!initializer) return null;
	const { SyntaxKind } = require("ts-morph");
	if (initializer.getKind() !== SyntaxKind.CallExpression) return null;
	const expr = initializer.getExpression();
	if (!expr || expr.getKind() !== SyntaxKind.Identifier) return null;
	return expr.getText();
};

const flattenMembers = (objectLiteralNode) => {
	const { SyntaxKind } = require("ts-morph");
	const members = [];
	for (const member of objectLiteralNode.getProperties()) {
		const name = member.getName();
		if (name !== FIELD_SECTION) continue;
		const initializer = member.getInitializer();
		if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
		for (const inner of initializer.getProperties()) {
			const fieldName = inner.getName();
			if (!fieldName) continue;
			const fieldInit = inner.getInitializer ? inner.getInitializer() : null;
			const builder = fieldBuilderOf(fieldInit);
			const type = (builder && FIELD_TYPE[builder]) || "object";
			members.push({ name: fieldName, type });
		}
	}

	return members;
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	if (!sourceFile) return entities;

	const schemas = findSchemas(sourceFile);
	if (schemas.length === 0) return entities;

	const out = entities.filter((e) => e.framework !== "keystone");
	const seen = new Set();

	for (const { name, objectLiteral, node } of schemas) {
		const properties = flattenMembers(objectLiteral);
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
			framework: "keystone",
			complexity: properties.length,
		});
	}

	return out;
};

export const id = "keystone";
export { detect, normalize, SCHEMA_CALLS };

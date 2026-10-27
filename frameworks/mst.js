"use strict";

// mobx-state-tree normalizer.
//
// MST stores are `const Model = t.model("Name", { ... })` — a property-access
// call whose first argument is the model name and whose second argument is the
// shape. The base normalizer already extracts the object literal (as an
// anonymous-ish "object" entity), but its member types are raw TS text; MST
// members are `t.boolean`, `t.maybeNull(t.string)`, `passthrough<T>()`, ...
// This normalizer re-extracts each `t.model` call with canonical member types
// (`t.boolean` -> "boolean", `t.maybeNull(X)` -> "X?", `t.array(X)` -> "X[]",
// `passthrough<T>()` -> "T", ...) so a hand-written `type X = { ... }` copy of
// the same shape compares equal to the store model.
//
// The type builders are matched structurally (property-access callee on the
// imported module name, or a bare identifier), never by a hardcoded word list
// of business names.

const { SyntaxKind } = require("ts-morph");

// `t` is the conventional import alias, but any alias works — detect the real
// one from the import declaration.
const MST_SPECIFIER = "mobx-state-tree";

// Type builders that take NO type argument and resolve to a primitive.
const PRIMITIVE_BUILDERS = new Set(["boolean", "string", "number"]);

// Builders that take a single inner type argument node.
const UNARY_BUILDERS = new Map([
	["optional", (inner) => `${inner}?`],
	["maybeNull", (inner) => `${inner}?`],
	["nullable", (inner) => `${inner}?`],
	["array", (inner) => `${inner}[]`],
	["late", (inner) => inner],
]);

const detect = (text) =>
	/from\s*["'][^"']*mobx-state-tree["']/.test(text) || /\bt\.model\s*\(/.test(text);

// Name of the identifier the file imports mobx-state-tree as (null if absent).
// Handles `import { types as t }`, `import * as t`, and `import t = require(...)`.
const mstImportName = (sourceFile) => {
	for (const decl of sourceFile.getImportDeclarations()) {
		if (call(decl, "getModuleSpecifierValue") !== MST_SPECIFIER) continue;
		// `import * as t from "mobx-state-tree"`
		const ns = call(decl, "getNamespaceImport");
		if (ns) return call(ns, "getName");
		const clause = call(decl, "getImportClause");
		if (clause) {
			for (const spec of call(clause, "getNamedImports") || []) {
				// `import { types as t }` — the alias is the local name.
					const alias = call(spec, "getAliasNode");
				return alias ? call(alias, "getText") : call(spec, "getName");
			}
		}
	}

	return null;
};

const call = (node, method, ...args) => (node && typeof node[method] === "function" ? node[method](...args) : undefined);

const lineOf = (node, sourceFile, atEnd = false) => {
	const pos = atEnd ? node.getEnd() : node.getStart();
	const { line } = sourceFile.getLineAndColumnAtPos(pos);

	return line;
};

// Canonical type of one model property initializer.
const canonicalMemberType = (initializer) => {
	const k = initializer.getKind();

	// `t.boolean`, `t.string`, `t.number` — bare or property-access.
	if (k === SyntaxKind.Identifier || k === SyntaxKind.PropertyAccessExpression) {
		const name = k === SyntaxKind.Identifier ? initializer.getText() : call(initializer, "getName");
		if (PRIMITIVE_BUILDERS.has(name)) return name;
	}

	// `t.array(t.string())`, `t.maybeNull(t.string())`, ...
	if (k === SyntaxKind.CallExpression) {
		const expr = call(initializer, "getExpression");
		const name = expr && expr.getKind() === SyntaxKind.PropertyAccessExpression ? call(expr, "getName") : expr && expr.getKind() === SyntaxKind.Identifier ? expr.getText() : null;
		const args = call(initializer, "getArguments") || [];

		// `t.string()`, `t.boolean()` — primitive builder called with no args.
		if (name && PRIMITIVE_BUILDERS.has(name) && args.length === 0) return name;

		if (name && UNARY_BUILDERS.has(name) && args.length >= 1) {
			const inner = canonicalMemberType(args[0]);

			return UNARY_BUILDERS.get(name)(inner || "object");
		}
		// `t.frozen<T>()`, `t.enumeration<T>([...])`, `passthrough<T>(...)` —
		// the first TYPE argument is the payload type.
		const typeArgs = call(initializer, "getTypeArguments") || [];
		if (typeArgs.length) {
			const ta = typeArgs[0];
			const ref = ta.getKind() === SyntaxKind.TypeReference ? call(ta, "getText") : null;

			return ref || "object";
		}
	}

	// `t.optional(t.string(), "")` is covered above; fall back to the raw
	// canonical text for anything exotic.
	const text = initializer.getText();

	return text.replace(/\s+/g, " ").trim() || "object";
};

// Find every `t.model("Name", { ... })` call bound to a variable.
const findModels = (sourceFile) => {
	const modName = mstImportName(sourceFile);
	const out = [];

	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.CallExpression) return;
		const expr = call(node, "getExpression");
		if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;
		if (call(expr, "getName") !== "model") return;
		const owner = call(expr, "getExpression");
		// The callee must be the imported module (or a bare `t` when the
		// import is not visible, e.g. re-exported helpers).
		if (owner && owner.getKind() === SyntaxKind.Identifier && modName && owner.getText() !== modName) return;
		const args = call(node, "getArguments") || [];
		if (args.length < 2 || args[0].getKind() !== SyntaxKind.StringLiteral || args[1].getKind() !== SyntaxKind.ObjectLiteralExpression) return;

		let parent = node;
		let varName = null;
		while (parent && typeof parent.getParent === "function") {
			const p = parent.getParent();
			if (!p) break;
			if (p.getKind() === SyntaxKind.VariableDeclaration) {
				const nn = call(p, "getNameNode");
				if (nn && nn.getKindName() === "Identifier") varName = nn.getText();
				break;
			}
			if (p.getKind() === SyntaxKind.VariableStatement) break;
			parent = p;
		}
		if (!varName) return;
		out.push({ name: varName, modelName: args[0].getText().replace(/^["']|["']$/g, ""), objectLiteral: args[1], node });
	});

	return out;
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	if (!sourceFile) return entities;

	const models = findModels(sourceFile);
	if (models.length === 0) return entities;

	// The base normalizer may have extracted the same object literal as a
	// plain "object" entity — drop those in favor of the canonical mst ones.
	const modelNames = new Set(models.map((m) => m.name));
	const out = entities.filter((e) => {
		if (e.framework === "mst") return false;
		if (e.kind === "object" && !e.framework && modelNames.has(e.name)) return false;
		return true;
	});
	const seen = new Set();

	for (const { name, modelName, objectLiteral, node } of models) {
		const properties = [];
		for (const prop of call(objectLiteral, "getProperties") || []) {
			if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
			const pName = call(prop, "getName");
			const init = call(prop, "getInitializer");
			if (!pName || !init) continue;
			properties.push({ name: pName, type: canonicalMemberType(init) });
		}
		if (properties.length === 0) continue;
		const line = lineOf(node, sourceFile);
		const endLine = lineOf(node, sourceFile, true);
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
			framework: "mst",
			complexity: properties.length,
			modelName,
			storeModel: true,
		});
	}

	// `type X = Instance<typeof Model>` aliases are the store's GENERATED
	// instance type — not a hand-written shape. Tag them so the store-linked
	// filter can drop pairs involving them.
	const modelVars = new Set(models.map((m) => m.name));
	for (const e of out) {
		if (e.kind !== "type" || e.aliasOf) continue;
		const m = e.typeText && e.typeText.match(/^Instance<\s*typeof\s+([A-Za-z0-9_$.]+)/);
		if (m && modelVars.has(m[1])) {
			e.generated = true;
			e.modelName = m[1];
		}
	}

	return out;
};

module.exports = { id: "mst", detect, normalize };

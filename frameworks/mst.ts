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

import { SyntaxKind } from "ts-morph";
import { canonicalMemberType } from "./mst-types";
import { boundName, chainTop, chainSegments, propsOf, returnedObject, viewsOf, actionsOf } from "./mst-chain";

// `t` is the conventional import alias, but any alias works — detect the real
// one from the import declaration.
const MST_SPECIFIER = "mobx-state-tree";

const detect = (text) =>
	/from\s*["'][^"']*mobx-state-tree["']/.test(text) || /\bt\.model\s*\(/.test(text) || /\bt\.compose\s*\(/.test(text);

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

// Canonical member types live in mst-types.ts (shared with the chain extractor).

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

// Find every `t.compose("Name", A, B, ...)` call bound to a variable. The
// identifier arguments are the composed BASE models (heritage), the string is
// the model name. Chained `.props/.views/.actions` on the result are folded in
// by collectChain below.
const findComposes = (sourceFile) => {
	const modName = mstImportName(sourceFile);
	const out = [];
	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.CallExpression) return;
		const expr = call(node, "getExpression");
		if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;
		if (call(expr, "getName") !== "compose") return;
		const owner = call(expr, "getExpression");
		if (owner && owner.getKind() === SyntaxKind.Identifier && modName && owner.getText() !== modName) return;
		const args = call(node, "getArguments") || [];
		const nameArg = args[0] && args[0].getKind() === SyntaxKind.StringLiteral ? args[0] : null;
		const bases = args.slice(nameArg ? 1 : 0).filter((a) => a.getKind() === SyntaxKind.Identifier).map((a) => a.getText());
		const varName = boundName(node);
		if (!varName || bases.length === 0) return;
		out.push({ name: varName, modelName: nameArg ? nameArg.getText().replace(/^["']|["']$/g, "") : varName, bases, node });
	});

	return out;
};

// A chained EXTENSION bound to its own variable: `const Auditable = Entity
// .props({...}).views(...)` — the root is another model (an Identifier or a
// t.model/t.compose call), and the new binding is a distinct entity whose
// heritage is that root. Collect the chain's own segments (not the root's).
const findExtensions = (sourceFile, knownNames) => {
	const out = [];
	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.VariableDeclaration) return;
		const name = call(node, "getName");
		const init = call(node, "getInitializer");
		if (!name || !init || init.getKind() !== SyntaxKind.CallExpression) return;
		if (knownNames.has(name)) return;
		// Walk down the chain to its root expression.
		let cur = init;
		let hasSegment = false;
		while (cur && cur.getKind() === SyntaxKind.CallExpression) {
			const expr = call(cur, "getExpression");
			if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) break;
			const seg = call(expr, "getName");
			if (seg !== "props" && seg !== "views" && seg !== "actions") break;
			hasSegment = true;
			cur = call(expr, "getExpression");
		}
		if (!hasSegment || !cur) return;
		// The root must be a known model identifier or a t.model/t.compose call.
		let rootName = null;
		if (cur.getKind() === SyntaxKind.Identifier) rootName = cur.getText();
		else if (cur.getKind() === SyntaxKind.CallExpression) {
			const expr = call(cur, "getExpression");
			const owner = expr && expr.getKind() === SyntaxKind.PropertyAccessExpression ? call(expr, "getExpression") : null;
			if (owner && owner.getKind() === SyntaxKind.Identifier) rootName = boundName(cur) ?? owner.getText();
		}
		if (!rootName || !knownNames.has(rootName)) return;
		out.push({ name, rootName, node: init });
	});

	return out;
};

// Fold a chain's `.props/.views/.actions` segments into one shape. The chain
// root may be a `t.model` (already extracted) or a `t.compose` (bases only);
// either way the segments add properties, read-only views and action methods.
const collectChain = (innerNode) => {
	const properties = [];
	const methods = [];
	for (const seg of chainSegments(chainTop(innerNode))) {
		if (seg.kind === "props") {
			const arg = (call(seg.node, "getArguments") || [])[0];
			if (arg && arg.getKind() === SyntaxKind.ObjectLiteralExpression) properties.push(...propsOf(arg));
			continue;
		}
		const obj = returnedObject(seg.node);
		if (!obj) continue;
		if (seg.kind === "views") properties.push(...viewsOf(obj));
		else methods.push(...actionsOf(obj));
	}

	return { properties, methods };
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	if (!sourceFile) return entities;

	const models = findModels(sourceFile);
	const composes = findComposes(sourceFile);
	if (models.length === 0 && composes.length === 0) return entities;

	// The base normalizer may have extracted the same object literal as a
	// plain "object" entity — drop those in favor of the canonical mst ones.
	const modelNames = new Set([...models.map((m) => m.name), ...composes.map((c) => c.name)]);
	const out = entities.filter((e) => {
		if (e.framework === "mst") return false;
		if (e.kind === "object" && !e.framework && modelNames.has(e.name)) return false;
		return true;
	});
	const seen = new Set();

	const push = (name, modelName, node, properties, methods, bases) => {
		if (properties.length === 0 && methods.length === 0 && bases.length === 0) return;
		const line = lineOf(node, sourceFile);
		const endLine = lineOf(node, sourceFile, true);
		const key = `${sourceFile.getFilePath()}|${line}|${name}`;
		if (seen.has(key)) return;
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
			methods,
			constructors: [],
			// Composition IS MST's heritage: the base models it composes.
			extends: bases.length === 1 ? bases[0] : bases.length > 1 ? bases : null,
			implements: [],
			uses: [],
			imports: [...ctx.imports],
			framework: "mst",
			complexity: properties.length + methods.length,
			modelName,
			storeModel: true,
		});
	};

	for (const { name, modelName, objectLiteral, node } of models) {
		const own = propsOf(objectLiteral);
		// A model may itself be chained: `Entity.props({...}).views(...)`.
		const chain = collectChain(node);
		push(name, modelName, node, [...own, ...chain.properties], chain.methods, []);
	}
	for (const { name, modelName, bases, node } of composes) {
		const chain = collectChain(node);
		// An INLINE `types.model({...})` argument contributes its own props too
		// (e.g. TreeNode's recursive `children`/`parentId` alongside BaseNode).
		const inlineProps = [];
		const args = call(node, "getArguments") || [];
		for (const arg of args) {
			if (arg.getKind() !== SyntaxKind.CallExpression) continue;
			const expr = call(arg, "getExpression");
			if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression || call(expr, "getName") !== "model") continue;
			// `types.model({...})` (one arg) or `types.model("Name", {...})` (two).
			const modelArgs = call(arg, "getArguments") || [];
			const shape = modelArgs.find((a) => a.getKind() === SyntaxKind.ObjectLiteralExpression);
			if (shape) inlineProps.push(...propsOf(shape));
		}
		push(name, modelName, node, [...inlineProps, ...chain.properties], chain.methods, bases);
	}
	// Chained extensions bound to new variables (Entity.props(...) as Auditable):
	// each is its own entity with the root model as heritage. Iterate to a fixed
	// point so a chain of extensions (A → B → C) all resolve.
	let known = new Set(modelNames);
	for (;;) {
		const exts = findExtensions(sourceFile, known);
		const fresh = exts.filter((e) => !known.has(e.name));
		if (fresh.length === 0) break;
		for (const { name, rootName, node } of fresh) {
			const chain = collectChain(node);
			push(name, name, node, chain.properties, chain.methods, [rootName]);
			known.add(name);
		}
	}

	// `type X = Instance<typeof Model>` aliases are the store's GENERATED
	// instance type — not a hand-written shape. Tag them so the store-linked
	// filter can drop pairs involving them.
	const modelVars = new Set(modelNames);
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

export const id = "mst";
export { detect, normalize };

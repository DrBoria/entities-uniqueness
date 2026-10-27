"use strict";

// Normalizes TypeScript source files into a flat list of comparable entities.
//
// An entity is an object literal (top-level, nested inside a function, or
// exported via an export list), a class (declaration or expression), or an
// interface. Each entity carries its properties and methods with canonical
// type strings (see ./types.js) so downstream matchers can compare shapes.
//
// The normalizer is framework-agnostic: frameworks (mobx, zustand, zod, ...)
// run afterwards and re-normalize the entities they recognize.

const { readFileSync } = require("node:fs");
const { Project } = require("ts-morph");
const { canonicalType } = require("./types.js");

// Placeholder type strings for values whose concrete type cannot be inferred.
const GENERIC_TYPES = new Set(["object", "array"]);

const call = (node, method, ...args) => {
	const fn = node[method];
	return typeof fn === "function" ? fn.apply(node, args) : undefined;
};

const nodeKind = (node) => {
	const k = call(node, "getKind");
	return typeof k === "number" ? k : undefined;
};

// ts-morph 28 nodes have no getLineNumber(); resolve the line from the
// node's start position against its source file.
const lineOf = (node, sourceFile, atEnd = false) => {
	const pos = call(node, atEnd ? "getEnd" : "getStart");
	if (typeof pos !== "number") return 1;
	const lc = call(sourceFile, "getLineAndColumnAtPos", pos);
	return lc && typeof lc.line === "number" ? lc.line : 1;
};

const isClassLikeNode = (node) => {
	const k = nodeKind(node);
	if (k === undefined) return false;
	const { SyntaxKind } = require("ts-morph");
	return k === SyntaxKind.ClassDeclaration || k === SyntaxKind.ClassExpression;
};

const resolveType = (node) => {
	try {
		return node.getType();
	} catch {
		return null;
	}
};

// Canonical type string for the value a node expression holds.
const inferType = (node) => {
	try {
		const k = nodeKind(node);
		const { SyntaxKind } = require("ts-morph");

		// `expr as T` — the assertion carries the intended type.
		if (k === SyntaxKind.AsExpression || k === SyntaxKind.TypeAssertionExpression) {
			const typeNode = call(node, "getTypeNode");
			if (typeNode) return canonicalType(typeNode) || "object";
			const resolved = resolveType(node);
			if (resolved) return resolved.getText() || "object";
			return "object";
		}

		if (k === SyntaxKind.ObjectLiteralExpression) return "object";
		if (k === SyntaxKind.ArrayLiteralExpression) return "array";
		if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) return "function";
		if (k === SyntaxKind.TemplateExpression || k === SyntaxKind.NoSubstitutionTemplateLiteral) return "string";

		const resolved = resolveType(node);
		if (resolved) {
			// Literal-typed initializers (`false`, `3`, `"x"`) resolve to their
			// literal type — map them to the primitive so shapes compare.
			if (typeof resolved.isBooleanLiteral === "function" && resolved.isBooleanLiteral()) return "boolean";
			if (typeof resolved.isNumberLiteral === "function" && resolved.isNumberLiteral()) return "number";
			if (typeof resolved.isStringLiteral === "function" && resolved.isStringLiteral()) return "string";
			if (typeof resolved.isTemplateLiteral === "function" && resolved.isTemplateLiteral()) return "string";
			const text = resolved.getText();
			if (text && text !== "any" && text !== "unknown") return text;
		}
		return "object";
	} catch {
		return "object";
	}
};

// Properties of an object-literal node: [{ name, type }].
// Factory members (`key: () => ({...})`) contribute the properties of the
// returned object instead of a bare "function" type.
const objectLiteralMembers = (objectLiteralNode) => {
	const members = [];
	for (const member of call(objectLiteralNode, "getProperties") || []) {
		const name = call(member, "getName");
		if (!name) continue;

		if (call(member, "isMethodDeclaration")) {
			members.push({ name, type: "function" });
			continue;
		}

		if (call(member, "isShorthandPropertyAssignment") || call(member, "isSpreadAssignment")) {
			members.push({ name, type: "object" });
			continue;
		}

		const initializer = call(member, "getInitializer");
		if (!initializer) {
			const typeNode = call(member, "getTypeNode");
			const t = typeNode ? canonicalType(typeNode) || "object" : "object";
			// `Record<number, X>` maps are keyed by numeric id — the keys are
			// data, not shape. Only string-keyed records count as properties.
			if (/^Record<\s*number\b/.test(t)) continue;
			members.push({ name, type: t });
			continue;
		}

		const k = nodeKind(initializer);
		const { SyntaxKind } = require("ts-morph");
		if (k === SyntaxKind.ArrowFunction || k === SyntaxKind.FunctionExpression) {
			let body = call(initializer, "getBody");
			// `() => ({ ... })` — the object literal is wrapped in parens.
			if (body && nodeKind(body) === SyntaxKind.ParenthesizedExpression) body = call(body, "getExpression");
			const bodyKind = body ? nodeKind(body) : undefined;
			if (body && bodyKind === SyntaxKind.ObjectLiteralExpression) {
				for (const inner of objectLiteralMembers(body)) members.push(inner);
				continue;
			}
			const statements = call(initializer, "getStatements") || [];
			const last = statements[statements.length - 1];
			const ret = last && call(last, "getExpression") ? call(last, "getExpression") : null;
			if (ret && nodeKind(ret) === SyntaxKind.ObjectLiteralExpression) {
				for (const inner of objectLiteralMembers(ret)) members.push(inner);
				continue;
			}
			members.push({ name, type: "function" });
			continue;
		}

		const t = inferType(initializer);
		if (/^Record<\s*number\b/.test(t)) continue;
		members.push({ name, type: t });
	}
	return members;
};

// Class / interface (declaration or expression) -> entity.
const extractClassLike = (node, { name, exported, sourceFile, isInterface }) => {
	const properties = [];
	const methods = [];
	const { SyntaxKind } = require("ts-morph");

	for (const member of call(node, "getMembers") || []) {
		// ts-morph 28 member nodes lack the isPropertyDeclaration()/
		// isMethodDeclaration() predicates — dispatch on the kind instead.
		const mk = nodeKind(member);
		if (mk === SyntaxKind.PropertyDeclaration || mk === SyntaxKind.PropertySignature) {
			const pName = call(member, "getName");
			if (!pName) continue;
			const typeNode = call(member, "getTypeNode");
			const initializer = call(member, "getInitializer");
			const type = typeNode
				? canonicalType(typeNode) || "object"
				: initializer
					? inferType(initializer)
					: "object";
			properties.push({ name: pName, type });
			continue;
		}
		if (mk === SyntaxKind.MethodDeclaration || mk === SyntaxKind.MethodSignature) {
			const mName = call(member, "getName");
			if (!mName) continue;
			const params = (call(member, "getParameters") || []).map((p) => call(p, "getName") || "");
			const typeNode = call(member, "getReturnType");
			methods.push({ name: mName, params, returnType: typeNode ? canonicalType(typeNode) || "void" : "void" });
			continue;
		}
		// Constructor parameter properties (`constructor(private x: string)`)
		// are Parameters carrying visibility/readonly modifiers — they are
		// properties of the class, not method args.
		if (mk === SyntaxKind.Constructor) {
			for (const prm of call(member, "getParameters") || []) {
				const mods = call(prm, "getModifiers") || [];
				const isParamProperty = mods.some((m) => {
					const t = call(m, "getText");
					return t === "private" || t === "protected" || t === "public" || t === "readonly";
				});
				if (!isParamProperty) continue;
				const pName = call(prm, "getName");
				if (!pName) continue;
				const typeNode = call(prm, "getTypeNode");
				properties.push({ name: pName, type: typeNode ? canonicalType(typeNode) || "object" : "object" });
			}
		}
	}

	const heritage = call(node, "getHeritageClauses") || [];
	const extendsList = [];
	const implementsList = [];
	for (const clause of heritage) {
		const token = call(clause, "getToken");
		const isExtends = token === SyntaxKind.ExtendsKeyword;
		// ts-morph 28 heritage clauses expose getTypeNodes(), not getExpressions().
		for (const expr of call(clause, "getTypeNodes") || []) {
			const t = canonicalType(expr) || call(expr, "getText") || "";
			if (isExtends) extendsList.push(t);
			else implementsList.push(t);
		}
	}

	const line = lineOf(node, sourceFile);
	const endLine = lineOf(node, sourceFile, true);

	return {
		id: `${sourceFile.getFilePath()}#${name}`,
		name,
		kind: isInterface ? "interface" : "class",
		sourceFile: sourceFile.getFilePath(),
		line,
		endLine,
		exported,
		properties,
		methods,
		constructors: [],
		extends: extendsList.length === 1 ? extendsList[0] : extendsList.length > 1 ? extendsList : null,
		implements: implementsList,
		uses: [],
		imports: [],
		framework: null,
		complexity: properties.length + methods.length,
	};
};

// Type alias -> entity.
//   type X = { ... }         -> kind "type", properties from the literal
//   type X = Y               -> kind "type", aliasOf "Y" (no own shape)
//   type X = SomeType<...>   -> kind "type", typeText = canonical text
// Aliases whose target contains a `typeof` (TypeQuery) are framework
// instance types (e.g. `Instance<typeof Model>`) — the generated type of a
// store, not a hand-written shape — so they are not extracted.
const extractTypeAlias = (node, { name, exported, sourceFile }) => {
	const { SyntaxKind } = require("ts-morph");
	const typeNode = call(node, "getTypeNode");
	if (!typeNode) return null;

	// `typeof` anywhere in the alias target marks a framework instance type
	// (e.g. `Instance<typeof Model>`) — the generated type of a store, not a
	// hand-written shape.
	let hasTypeQuery = false;
	typeNode.forEachDescendant((d) => {
		if (nodeKind(d) === SyntaxKind.TypeQuery) hasTypeQuery = true;
	});
	if (hasTypeQuery) return null;

	const k = nodeKind(typeNode);
	const properties = [];
	const methods = [];
	let aliasOf = null;
	let typeText = null;

	if (k === SyntaxKind.TypeLiteral) {
		for (const member of call(typeNode, "getMembers") || []) {
			const mk = nodeKind(member);
			if (mk === SyntaxKind.PropertySignature) {
				const pName = call(member, "getName");
				if (!pName) continue;
				const tNode = call(member, "getTypeNode");
				const t = tNode ? canonicalType(tNode) || "object" : "object";
				// `Record<number, X>` maps are keyed by numeric id — the keys
				// are data, not shape (mirrors objectLiteralMembers).
				if (/^Record<\s*number\b/.test(t)) continue;
				properties.push({ name: pName, type: t });
			} else if (mk === SyntaxKind.MethodSignature) {
				const mName = call(member, "getName");
				if (!mName) continue;
				const params = (call(member, "getParameters") || []).map((p) => call(p, "getName") || "");
				const rtNode = call(member, "getReturnType");
				methods.push({ name: mName, params, returnType: rtNode ? canonicalType(rtNode) || "void" : "void" });
			}
		}
	} else if (k === SyntaxKind.TypeReference && (call(typeNode, "getTypeArguments") || []).length === 0) {
		aliasOf = call(typeNode, "getText") || null;
	} else {
		typeText = canonicalType(typeNode) || call(typeNode, "getText") || null;
	}

	const line = lineOf(node, sourceFile);
	const endLine = lineOf(node, sourceFile, true);

	return {
		id: `${sourceFile.getFilePath()}#${name}`,
		name,
		kind: "type",
		sourceFile: sourceFile.getFilePath(),
		line,
		endLine,
		exported,
		properties,
		methods,
		constructors: [],
		extends: null,
		implements: [],
		uses: [],
		imports: [],
		framework: null,
		complexity: properties.length + methods.length,
		aliasOf,
		typeText,
	};
};

const extractObject = (name, objectNode, { exported, sourceFile, imports }) => {
	const properties = objectLiteralMembers(objectNode);
	const line = lineOf(objectNode, sourceFile);
	const endLine = lineOf(objectNode, sourceFile, true);

	return {
		id: `${sourceFile.getFilePath()}#${name}`,
		name,
		kind: "object",
		sourceFile: sourceFile.getFilePath(),
		line,
		endLine,
		exported,
		properties,
		methods: [],
		constructors: [],
		extends: null,
		implements: [],
		uses: [],
		imports: [...imports],
		framework: null,
		complexity: properties.length,
	};
};

// Parses a file (or provided text) and extracts entities.
//
// Returns { entities, sourceFile, text, imports } where sourceFile is the
// ts-morph SourceFile (frameworks inspect it) and imports is the set of named
// import specifiers in the file.
const parseAndExtract = (file, options = {}) => {
	const { requireExported = false } = options;
	let text = options.text;
	const project = new Project({
		useInMemoryFileSystem: Boolean(text),
		compilerOptions: { allowJs: true, jsx: 1 /* React */ },
	});
	let sourceFile;
	if (text !== undefined) {
		sourceFile = project.createSourceFile(file, text, { overwrite: true });
	} else {
		sourceFile = project.addSourceFileAtPath(file);
		text = readFileSync(file, "utf8");
	}

	const imports = new Set();
	for (const decl of call(sourceFile, "getImportDeclarations") || []) {
		for (const spec of call(decl, "getNamedImports") || []) imports.add(call(spec, "getName") || "");
	}

	const entities = [];
	if (/\.e2e\.[cm]?[jt]sx?$/.test(file)) return { entities, sourceFile, text, imports };

	// Names exported via `export { A, B }` lists.
	const exportList = new Set();
	for (const stmt of call(sourceFile, "getStatements") || []) {
		if (call(stmt, "isExportDeclaration")) {
			for (const spec of call(stmt, "getExportedNames") || []) exportList.add(spec);
		}
	}

	const isExported = (node) => {
		const mods = call(node, "getModifiers") || [];
		return mods.some((m) => call(m, "isKeyword") && String(call(m, "getText")) === "export");
	};

	const { SyntaxKind } = require("ts-morph");
	const seen = new Set();
	const push = (entity) => {
		if (seen.has(entity.id)) return;
		seen.add(entity.id);
		entities.push(entity);
	};

	sourceFile.forEachDescendant((node) => {
		const k = nodeKind(node);
		if (k === SyntaxKind.VariableStatement) {
			const stmt = node;
			for (const decl of call(stmt, "getDeclarations") || []) {
				const name = call(decl, "getName");
				const initializer = call(decl, "getInitializer");
				if (!name || !initializer) continue;
				const exported = isExported(stmt) || exportList.has(name);
				if (requireExported && !exported) continue;
				const ik = nodeKind(initializer);
				if (ik === SyntaxKind.ObjectLiteralExpression) {
					// `const x: Foo = { ... }` — a literal annotated with a
					// named type implements that type: the interface/type is
					// the entity, the literal is an instance, not a new one.
					// Only a bare (argument-free) TypeReference counts as a
					// named type — `Record<string, string>` is a generic shape
					// annotation, and the literal is still its own entity.
					const typeNode = call(decl, "getTypeNode");
					const isNamedType = typeNode && nodeKind(typeNode) === SyntaxKind.TypeReference && (call(typeNode, "getTypeArguments") || []).length === 0;
					if (isNamedType) continue;
					push(extractObject(name, initializer, { exported, sourceFile, imports }));
				} else if (isClassLikeNode(initializer)) {
					const exprName = call(initializer, "getName") || name;
					push(extractClassLike(initializer, { name: exprName, exported, sourceFile, isInterface: false }));
				}
			}
			return;
		}
		if (k === SyntaxKind.ClassDeclaration) {
			push(
				extractClassLike(node, {
					name: call(node, "getName") || "anonymous",
					exported: isExported(node),
					sourceFile,
					isInterface: false,
				}),
			);
			return;
		}
		if (k === SyntaxKind.InterfaceDeclaration) {
			push(
				extractClassLike(node, {
					name: call(node, "getName") || "anonymous",
					exported: isExported(node),
					sourceFile,
					isInterface: true,
				}),
			);
			return;
		}
		if (k === SyntaxKind.TypeAliasDeclaration) {
			const name = call(node, "getName");
			if (!name) return;
			const entity = extractTypeAlias(node, { name, exported: isExported(node), sourceFile });
			if (entity) push(entity);
		}
	});

	return { entities, sourceFile, text, imports };
};

// Convenience: entities from a file on disk.
const extractFromFile = (file) => parseAndExtract(file).entities;

module.exports = {
	GENERIC_TYPES,
	canonicalType,
	extractFromFile,
	inferType,
	objectLiteralMembers,
	parseAndExtract,
};

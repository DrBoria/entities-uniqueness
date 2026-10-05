"use strict";

const fs = require("node:fs");
const { pipe, filter, map, flatMap } = require("remeda");

let ts;
try {
	ts = require("typescript");
} catch {
	ts = null;
}

const isExported = (node) => {
	let p = node;
	while (p) {
		if (p.kind === ts.SyntaxKind.ExportDeclaration || p.kind === ts.SyntaxKind.ExportAssignment) return true;
		if (p.kind === ts.SyntaxKind.ModuleDeclaration) return false;
		p = p.parent;
	}
	return false;
};

const isTopLevel = (node, sourceFile) => {
	let owner = node.parent;
	if (owner && owner.kind === ts.SyntaxKind.ExportDeclaration) owner = owner.parent;
	return owner === sourceFile;
};

const isTestFile = (sourceFile) => /\.(test|spec|stories)\.[jt]sx?$/.test(sourceFile.fileName);

const isValidMemberName = (text) => !!text && text.length <= 40 && !/\s/.test(text);

const memberNameFromPropertyName = (name) => {
	if (!name) return null;
	if (name.kind === ts.SyntaxKind.Identifier || name.kind === ts.SyntaxKind.PrivateIdentifier) return isValidMemberName(name.text) ? name.text : null;
	if (name.kind === ts.SyntaxKind.StringLiteral || name.kind === ts.SyntaxKind.NumericLiteral) return isValidMemberName(name.text) ? name.text : null;
	return null;
};

const isTaggedTemplate = (node) => node.kind === ts.SyntaxKind.TaggedTemplateExpression && node.tag.kind === ts.SyntaxKind.Identifier;

const zodObjectCall = (node) => {
	const members = new Set();
	let n = node;
	while (n && n.kind === ts.SyntaxKind.CallExpression) {
		const expr = n.expression;
		if (expr.kind !== ts.SyntaxKind.PropertyAccessExpression) return null;
		const methodName = expr.name.text;
		const callee = expr.expression;
		if (methodName === "object" || methodName === "extend") {
			const arg = n.arguments[0];
			if (arg && arg.kind === ts.SyntaxKind.ObjectLiteralExpression) {
				if (methodName === "object" && !(callee.kind === ts.SyntaxKind.Identifier && callee.text === "z")) return null;
				objectLiteralMembers(arg).forEach((m) => members.add(m));
			}
		}
		n = callee;
	}
	return members.size > 0 ? members : null;
};

const isReferenceLikeType = (node) => {
	if (!node) return false;
	if (node.kind === ts.SyntaxKind.TypeReference) {
		const args = node.typeArguments ? [...node.typeArguments] : [];
		if (args.some((a) => a.kind === ts.SyntaxKind.TypeLiteral)) return false;
		return true;
	}
	if (node.kind === ts.SyntaxKind.TypeOperator || node.kind === ts.SyntaxKind.TypeQuery) return isReferenceLikeType(node.type);
	if (node.kind === ts.SyntaxKind.UnionType || node.kind === ts.SyntaxKind.IntersectionType) {
		return node.types.some((t) => isReferenceLikeType(t));
	}
	return false;
};

const classMembers = (node) =>
	pipe(
		node.members,
		filter(
			(m) =>
				m.kind === ts.SyntaxKind.MethodDeclaration ||
				m.kind === ts.SyntaxKind.PropertyDeclaration ||
				m.kind === ts.SyntaxKind.Constructor ||
				m.kind === ts.SyntaxKind.GetAccessor ||
				m.kind === ts.SyntaxKind.SetAccessor,
		),
		map((m) => memberNameFromPropertyName(m.name)),
		filter((n) => n && n !== "constructor"),
	);

const typeLiteralMembers = (node) =>
	pipe(
		node.members,
		map((m) => memberNameFromPropertyName(m.name)),
		filter(Boolean),
	);

const objectLiteralMembers = (node) =>
	pipe(
		node.properties,
		flatMap((p) => {
			if (p.kind === ts.SyntaxKind.ShorthandPropertyAssignment) return [p.name.text];
			if (
				p.kind === ts.SyntaxKind.PropertyAssignment ||
				p.kind === ts.SyntaxKind.MethodDeclaration ||
				p.kind === ts.SyntaxKind.GetAccessor ||
				p.kind === ts.SyntaxKind.SetAccessor ||
				p.kind === ts.SyntaxKind.SpreadAssignment
			) {
				const n = memberNameFromPropertyName(p.name);
				return n ? [n] : [];
			}
			return [];
		}),
	);

const factoryMembers = (node) => {
	const out = new Set();
	const visit = (n) => {
		if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
			objectLiteralMembers(n).forEach((m) => out.add(m));
		}
		ts.forEachChild(n, visit);
	};
	if (node.body) visit(node.body);
	return out;
};

const isFactoryFunction = (node) => {
	if (node.kind !== ts.SyntaxKind.FunctionDeclaration && node.kind !== ts.SyntaxKind.FunctionExpression && node.kind !== ts.SyntaxKind.ArrowFunction) return false;
	let hasReturn = false;
	const visit = (n) => {
		if (n === node) return;
		if (n.kind === ts.SyntaxKind.ReturnStatement && n.expression && n.expression.kind === ts.SyntaxKind.ObjectLiteralExpression) {
			hasReturn = true;
			return;
		}
		if (n.kind === ts.SyntaxKind.ArrowFunction || n.kind === ts.SyntaxKind.FunctionExpression || n.kind === ts.SyntaxKind.FunctionDeclaration) return;
		ts.forEachChild(n, visit);
	};
	visit(node);
	if (node.kind === ts.SyntaxKind.ArrowFunction && node.body.kind === ts.SyntaxKind.ObjectLiteralExpression) hasReturn = true;
	return hasReturn;
};

const functionNameOf = (node, sourceFile) => {
	if (node.name && node.name.text) return node.name.text;
	if (node.parent && node.parent.kind === ts.SyntaxKind.VariableDeclaration && node.parent.name && node.parent.name.kind === ts.SyntaxKind.Identifier) {
		return node.parent.name.text;
	}
	return null;
};

const lineOf = (sourceFile, pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

const extractFromFile = (filePath, opts = {}) => {
	if (!ts) return [];
	const text = fs.readFileSync(filePath, "utf8");
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
	if (isTestFile(sourceFile)) return [];

	const requireExported = opts.requireExported === true;
	const records = [];
	const seen = new Set();

	const push = (name, kind, node, members) => {
		if (!name || members.size < 1) return;
		const exported = isExported(node);
		if (requireExported && !exported) return;
		const start = node.getStart(sourceFile);
		const end = node.getEnd();
		const k = `${filePath}|${lineOf(sourceFile, start)}|${name}`;
		if (seen.has(k)) return;
		seen.add(k);
		records.push({
			name,
			kind,
			path: filePath,
			line: lineOf(sourceFile, start),
			endLine: lineOf(sourceFile, end),
			members: [...members].sort(),
			exported,
		});
	};

	const handleStatement = (node) => {
		if (node.kind === ts.SyntaxKind.ClassDeclaration) {
			if (!isTopLevel(node, sourceFile)) return;
			const name = node.name && node.name.text;
			if (name) push(name, "class", node, new Set(classMembers(node)));
		} else if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
			if (!isTopLevel(node, sourceFile)) return;
			const name = node.name && node.name.text;
			if (name) push(name, "interface", node, new Set(typeLiteralMembers(node)));
		} else if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
			if (!isTopLevel(node, sourceFile)) return;
			const name = node.name && node.name.text;
			if (name && node.type && node.type.kind === ts.SyntaxKind.TypeLiteral) {
				push(name, "type", node, new Set(typeLiteralMembers(node.type)));
			}
		} else if (node.kind === ts.SyntaxKind.VariableStatement) {
			if (!isTopLevel(node, sourceFile)) return;
			for (const decl of node.declarationList.declarations) {
				const name = decl.name && decl.name.kind === ts.SyntaxKind.Identifier ? decl.name.text : null;
				if (!name || !decl.initializer) continue;
				if (isTaggedTemplate(decl.initializer)) continue;
				const zodMembers = zodObjectCall(decl.initializer);
				if (zodMembers) {
					if (zodMembers.size >= 2) push(name, "zod", node, zodMembers);
				} else if (decl.initializer.kind === ts.SyntaxKind.ObjectLiteralExpression) {
					if (isReferenceLikeType(decl.type)) continue;
					push(name, "object", node, new Set(objectLiteralMembers(decl.initializer)));
				} else if (isFactoryFunction(decl.initializer)) {
					const members = factoryMembers(decl.initializer);
					if (members.size >= 2) push(name, "factory", node, members);
				}
			}
		} else if (node.kind === ts.SyntaxKind.FunctionDeclaration) {
			if (!isTopLevel(node, sourceFile)) return;
			const name = node.name && node.name.text;
			if (name && isFactoryFunction(node)) {
				const members = factoryMembers(node);
				if (members.size >= 2) push(name, "factory", node, members);
			}
		}
	};

	sourceFile.statements.forEach((stmt) => {
		let node = stmt;
		if (node.kind === ts.SyntaxKind.ExportDeclaration) node = node.statement;
		if (!node) return;
		handleStatement(node);
	});

	return records;
};

const extractFromFiles = (filePaths, opts = {}) => {
	if (!ts || filePaths.length === 0) return [];
	return pipe(
		filePaths,
		flatMap((f) => {
			try {
				return extractFromFile(f, opts);
			} catch {
				return [];
			}
		}),
	);
};

module.exports = { extractFromFile, extractFromFiles };

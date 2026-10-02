"use strict";

const fs = require("node:fs");

let ts;
try {
	ts = require("typescript");
} catch {
	ts = null;
}

function isExported(node) {
	let p = node;
	while (p) {
		if (p.kind === ts.SyntaxKind.ExportDeclaration || p.kind === ts.SyntaxKind.ExportAssignment) return true;
		if (p.kind === ts.SyntaxKind.ModuleDeclaration) return false;
		p = p.parent;
	}
	return false;
}

function isTopLevel(node, sourceFile) {
	let owner = node.parent;
	if (owner && owner.kind === ts.SyntaxKind.ExportDeclaration) owner = owner.parent;
	return owner === sourceFile;
}

function isTestFile(sourceFile) {
	return /\.(test|spec|stories)\.[jt]sx?$/.test(sourceFile.fileName);
}

function isValidMemberName(text) {
	if (!text || text.length > 40) return false;
	if (/\s/.test(text)) return false;
	return true;
}

function memberNameFromPropertyName(name) {
	if (!name) return null;
	if (name.kind === ts.SyntaxKind.Identifier || name.kind === ts.SyntaxKind.PrivateIdentifier) {
		return isValidMemberName(name.text) ? name.text : null;
	}
	if (name.kind === ts.SyntaxKind.StringLiteral || name.kind === ts.SyntaxKind.NumericLiteral) {
		return isValidMemberName(name.text) ? name.text : null;
	}
	return null;
}

function isTaggedTemplate(node) {
	return node.kind === ts.SyntaxKind.TaggedTemplateExpression && node.tag.kind === ts.SyntaxKind.Identifier;
}

function zodObjectCall(node) {
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
				for (const m of objectLiteralMembers(arg)) members.add(m);
			}
		}
		n = callee;
	}
	return members.size > 0 ? members : null;
}

function isReferenceLikeType(node) {
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
}

function classMembers(node) {
	const out = new Set();
	for (const m of node.members) {
		if (m.kind === ts.SyntaxKind.MethodDeclaration || m.kind === ts.SyntaxKind.PropertyDeclaration || m.kind === ts.SyntaxKind.Constructor) {
			const n = memberNameFromPropertyName(m.name);
			if (n && n !== "constructor") out.add(n);
		} else if (m.kind === ts.SyntaxKind.GetAccessor || m.kind === ts.SyntaxKind.SetAccessor) {
			const n = memberNameFromPropertyName(m.name);
			if (n) out.add(n);
		}
	}
	return out;
}

function typeLiteralMembers(node) {
	const out = new Set();
	for (const m of node.members) {
		const n = memberNameFromPropertyName(m.name);
		if (n) out.add(n);
	}
	return out;
}

function objectLiteralMembers(node) {
	const out = new Set();
	for (const p of node.properties) {
		if (p.kind === ts.SyntaxKind.ShorthandPropertyAssignment) {
			out.add(p.name.text);
		} else if (p.kind === ts.SyntaxKind.PropertyAssignment || p.kind === ts.SyntaxKind.MethodDeclaration || p.kind === ts.SyntaxKind.GetAccessor || p.kind === ts.SyntaxKind.SetAccessor || p.kind === ts.SyntaxKind.SpreadAssignment) {
			const n = memberNameFromPropertyName(p.name);
			if (n) out.add(n);
		}
	}
	return out;
}

function factoryMembers(node) {
	const out = new Set();
	const visit = (n) => {
		if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
			for (const m of objectLiteralMembers(n)) out.add(m);
		}
		ts.forEachChild(n, visit);
	};
	if (node.body) visit(node.body);
	return out;
}

function isFactoryFunction(node) {
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
}

function functionNameOf(node, sourceFile) {
	if (node.name && node.name.text) return node.name.text;
	if (node.parent && node.parent.kind === ts.SyntaxKind.VariableDeclaration && node.parent.name && node.parent.name.kind === ts.SyntaxKind.Identifier) {
		return node.parent.name.text;
	}
	return null;
}

function lineOf(sourceFile, pos) {
	return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function extractFromFile(filePath, opts = {}) {
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

	for (const stmt of sourceFile.statements) {
		let node = stmt;
		if (node.kind === ts.SyntaxKind.ExportDeclaration) node = node.statement;
		if (!node) continue;

		if (node.kind === ts.SyntaxKind.ClassDeclaration) {
			if (!isTopLevel(node, sourceFile)) continue;
			const name = node.name && node.name.text;
			if (name) push(name, "class", node, classMembers(node));
		} else if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
			if (!isTopLevel(node, sourceFile)) continue;
			const name = node.name && node.name.text;
			if (name) push(name, "interface", node, typeLiteralMembers(node));
		} else if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) {
			if (!isTopLevel(node, sourceFile)) continue;
			const name = node.name && node.name.text;
			if (name && node.type && node.type.kind === ts.SyntaxKind.TypeLiteral) {
				push(name, "type", node, typeLiteralMembers(node.type));
			}
		} else if (node.kind === ts.SyntaxKind.VariableStatement) {
			if (!isTopLevel(node, sourceFile)) continue;
			for (const decl of node.declarationList.declarations) {
				const name = decl.name && decl.name.kind === ts.SyntaxKind.Identifier ? decl.name.text : null;
				if (!name || !decl.initializer) continue;
				if (isTaggedTemplate(decl.initializer)) continue;
				const zodMembers = zodObjectCall(decl.initializer);
				if (zodMembers) {
					if (zodMembers.size >= 2) push(name, "zod", node, zodMembers);
				} else if (decl.initializer.kind === ts.SyntaxKind.ObjectLiteralExpression) {
					if (isReferenceLikeType(decl.type)) continue;
					push(name, "object", node, objectLiteralMembers(decl.initializer));
				} else if (isFactoryFunction(decl.initializer)) {
					const members = factoryMembers(decl.initializer);
					if (members.size >= 2) push(name, "factory", node, members);
				}
			}
		} else if (node.kind === ts.SyntaxKind.FunctionDeclaration) {
			if (!isTopLevel(node, sourceFile)) continue;
			const name = node.name && node.name.text;
			if (name && isFactoryFunction(node)) {
				const members = factoryMembers(node);
				if (members.size >= 2) push(name, "factory", node, members);
			}
		}
	}

	return records;
}

function extractFromFiles(filePaths, opts = {}) {
	const out = [];
	if (!ts || filePaths.length === 0) return out;
	for (const f of filePaths) {
		try {
			out.push(...extractFromFile(f, opts));
		} catch {
			// unreadable / unparseable file — skip
		}
	}
	return out;
}

module.exports = { extractFromFile, extractFromFiles };

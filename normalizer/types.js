"use strict";

// Canonicalizes TypeScript type nodes to a normalized string so that semantically
// equivalent types compare equal:
//   - `string | null` / `string | undefined` / `string?`  ->  "string?"
//   - `Array<T>` / `T[]`                                   ->  "T[]"
//   - `Record<K, V>` / `{ [k: K]: V }`                     ->  "Record<K,V>"
//   - whitespace and ordering inside unions/intersections are normalized
//
// This is the single source of truth for type comparison in the matcher — no
// matcher ever compares raw type text.
//
// Built on ts-morph: nodes are ts-morph TypeNode instances, not raw TS AST.

const { SyntaxKind } = require("ts-morph");

const NULLISH = new Set(["null", "undefined"]);

// ts-morph 28 generic nodes may carry getKind() but lack the specific
// accessors — every accessor call below is guarded with typeof.
const call = (node, method, ...args) => (typeof node[method] === "function" ? node[method](...args) : undefined);

const typeText = (node) => {
	if (!node) return "unknown";

	// ts-morph 28 returns a `Type` object (not a TypeNode) from some
	// accessors (e.g. FunctionType.getReturnType()). It has getText() but no
	// getKind() — normalize its text directly.
	if (typeof node.getKind !== "function") return canonicalize(node.getText());

	const k = node.getKind();

	switch (k) {
		case SyntaxKind.AnyKeyword:
			return "any";
		case SyntaxKind.UnknownKeyword:
			return "unknown";
		case SyntaxKind.NeverKeyword:
			return "never";
		case SyntaxKind.VoidKeyword:
			return "void";
		case SyntaxKind.UndefinedKeyword:
			return "undefined";
		case SyntaxKind.NullKeyword:
			return "null";
		case SyntaxKind.BooleanKeyword:
			return "boolean";
		case SyntaxKind.StringKeyword:
			return "string";
		case SyntaxKind.NumberKeyword:
			return "number";
		case SyntaxKind.BigIntKeyword:
			return "bigint";
		case SyntaxKind.ObjectKeyword:
			return "object";
		case SyntaxKind.SymbolKeyword:
			return "symbol";
		case SyntaxKind.TemplateLiteralType:
			return "string";
		case SyntaxKind.ThisType:
			return "this";
		case SyntaxKind.LiteralType: {
			const lit = call(node, "getLiteral");
			if (!lit) return canonicalize(node.getText());
			// `null`/`undefined` appear in a union as a LiteralType wrapping the
			// keyword; they must surface as the nullish tokens so the union
			// normalizer can collapse `string | null` to `string?`.
			if (lit.getKind() === SyntaxKind.NullKeyword) return "null";
			if (lit.getKind() === SyntaxKind.UndefinedKeyword) return "undefined";
			// Preserve the literal's actual value (quotes included for strings)
			// instead of a bare "literal" token. Collapsing every literal to the
			// same token made two unions with DISJOINT values — e.g.
			// `kind: "comment"|"event"` vs `kind: "human"|"bot"` — compare as
			// equal types and falsely agree. Identical values still compare
			// equal, so genuine near-duplicates are untouched.
			return lit.getText();
		}
		case SyntaxKind.TypeReference: {
			const tn = call(node, "getTypeName");
			const name = tn ? tn.getText() : "unknown";
			const args = (call(node, "getTypeArguments") || []).map((a) => typeText(a));
			return args.length ? `${name}<${args.join(",")}>` : name;
		}
		case SyntaxKind.TypeLiteral: {
			const members = (call(node, "getMembers") || []).map((m) => {
				const mn = m.getName ? m.getName() : "?";
				const mt = m.getTypeNode ? (m.getTypeNode() ? typeText(m.getTypeNode()) : "unknown") : "unknown";

				return `${mn}:${mt}`;
			});

			return `{${members.join(";")}}`;
		}
		case SyntaxKind.ArrayType: {
			// ts-morph 28 ArrayTypeNode has no getElementType — the element
			// type is a child node (the non-bracket child for `T[]`).
			let el = call(node, "getElementType");
			if (!el && typeof node.getChildren === "function") {
				el = node.getChildren().find((c) => c.getKind() !== SyntaxKind.OpenBracketToken && c.getKind() !== SyntaxKind.CloseBracketToken) || null;
			}
			return `${el ? typeText(el) : "unknown"}[]`;
		}
		case SyntaxKind.TupleType: {
			const elems = (call(node, "getElements") || []).map((e) => typeText(e));

			return `(${elems.join(",")})`;
		}
		case SyntaxKind.UnionType: {
			const parts = (call(node, "getTypeNodes") || []).map((t) => typeText(t));
			const hasNullish = parts.some((p) => NULLISH.has(p));
			const rest = parts.filter((p) => !NULLISH.has(p));
			const base = [...new Set(rest)].sort().join("|");

			return hasNullish ? `${base}?` : base || "unknown";
		}
		case SyntaxKind.IntersectionType: {
			const parts = [...new Set((call(node, "getTypeNodes") || []).map((t) => typeText(t)))].sort();

			return parts.join("&");
		}
		case SyntaxKind.ParenthesizedType: {
			const inner = call(node, "getTypeNode");
			return inner ? typeText(inner) : canonicalize(node.getText());
		}
		case SyntaxKind.TypeOperator: {
			const inner = call(node, "getType");
			return inner ? typeText(inner) : canonicalize(node.getText());
		}
		case SyntaxKind.TypeQuery:
			return "ref";
		case SyntaxKind.FunctionType: {
			const params = (call(node, "getParameters") || []).map((p) => {
				const pt = typeof p.getTypeNode === "function" ? p.getTypeNode() : null;
				return pt ? typeText(pt) : "unknown";
			});
			const ret = call(node, "getReturnType");

			return `fn<${params.join(",")}>:${ret ? typeText(ret) : "void"}`;
		}
		case SyntaxKind.MappedType:
			return "Record";
		default:
			return node.getText().replace(/\s+/g, "");
	}
};

// `Array<T>` is a TypeReference with typeName "Array" and one type argument —
// normalize it to the `T[]` spelling so both spellings collide.
const canonicalize = (raw) => String(raw || "unknown").replace(/\bArray<([^>]*)>\b/g, "$1[]").replace(/\bReadonlyArray<([^>]*)>\b/g, "$1[]");

const canonicalType = (node) => {
	if (!node) return "unknown";

	return canonicalize(typeText(node));
};

module.exports = { canonicalType, typeText, NULLISH };

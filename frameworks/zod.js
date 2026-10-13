"use strict";

// Zod normalizer.
//
// The base normalizer cannot see inside `z.object({ ... })` — the shape is a
// call-argument, not a type literal. This normalizer finds zod object schemas
// and turns each into a UnifiedEntity of kind "zod" whose properties carry the
// canonical field type (z.string() -> "string", z.number().optional() -> "number?",
// z.array(z.string()) -> "string[]", ...).
//
// Built on ts-morph. The set of known zod method names is derived from the
// real zod package, not a hardcoded word list.

const z = require("zod");
const { SyntaxKind } = require("ts-morph");
const { canonicalType } = require("../normalizer/types");

// Base scalar builders: zod exports that are functions producing a primitive
// type (z.string, z.number, ...). `z.coerce` is an object of the same, handled
// separately.
const baseTypeOf = (name) => {
  switch (name) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "bigint":
      return "bigint";
    case "date":
      return "Date";
    case "any":
      return "any";
    case "unknown":
      return "unknown";
    case "never":
      return "never";
    case "undefined":
      return "undefined";
    case "null":
      return "null";
    case "literal":
      return "literal";
    case "uuidv4":
    case "uuid":
    case "email":
    case "url":
      return "string";
    default:
      return null;
  }
};

const ZOD_BASE_TYPES = new Map(
  Object.keys(z)
    .filter((k) => typeof z[k] === "function")
    .filter((k) => k !== "object" && k !== "array" && k !== "record" && k !== "enum")
    .map((k) => [k, baseTypeOf(k)])
    .filter(([, t]) => t !== null)
);

const isZodCall = (node, zNames) => {
  if (!node || node.getKind() !== SyntaxKind.CallExpression) return false;
  const expr = node.getExpression();
  if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const obj = expr.getExpression();
  if (!obj || obj.getKind() !== SyntaxKind.Identifier) return false;
  if (!zNames.has(obj.getText())) return false;
  const method = expr.getName();
  return (
    method === "object" ||
    method === "array" ||
    method === "record" ||
    method === "enum" ||
    ZOD_BASE_TYPES.has(method)
  );
};

// Canonical type for a zod field expression. Handles chains of any depth
// (z.string().url().optional()), z.instanceof / z.custom / z.nativeEnum /
// z.literal / z.record / z.coerce, and falls back to the expression text for
// references to other schemas (sexSchema, z.array(someSchema), ...).
const zodFieldType = (node, zNames) => {
  if (!node) return "unknown";
  const k = node.getKind();

  // z.string().optional() / z.instanceof(Tx.Day).optional() — a property
  // access on top of a zod expression. Recurse into the inner expression,
  // then apply the method's type transformation.
  if (k === SyntaxKind.PropertyAccessExpression) {
    const method = node.getName();
    const inner = zodFieldType(node.getExpression(), zNames);
    if (method === "optional" || method === "nullable" || method === "nullish") return `${inner}?`;
    if (method === "array") return `${inner}[]`;
    return inner;
  }

  if (k === SyntaxKind.CallExpression) {
    const expr = node.getExpression();
    if (expr && expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const method = expr.getName();
      const obj = expr.getExpression();
      const isZ = obj && obj.getKind() === SyntaxKind.Identifier && zNames.has(obj.getText());
      const args = node.getArguments();

      // z.optional(x) / z.array(x) — the shape is in the argument.
      if (isZ && (method === "optional" || method === "array")) {
        const inner = args.length ? zodFieldType(args[0], zNames) : "any";
        return method === "array" ? `${inner}[]` : `${inner}?`;
      }

      // z.instanceof(Tx.Day) / z.nativeEnum(Sex) — the type is the first
      // argument's text (an expression, not a TypeNode).
      if (isZ && (method === "instanceof" || method === "nativeEnum") && args.length) {
        return args[0].getText();
      }

      // z.custom<Tx.PlainDate>(fn) — the type is the type parameter.
      if (isZ && method === "custom") {
        const tp = node.getTypeArguments()[0];
        return tp ? canonicalType(tp) : "unknown";
      }

      // z.record(z.string(), z.string()) — a map type.
      if (isZ && method === "record" && args.length >= 2) {
        const key = zodFieldType(args[0], zNames);
        const val = zodFieldType(args[1], zNames);
        return `Record<${key},${val}>`;
      }

      // An inline z.object({ ... }) used as a field value has no name to
      // reference — "object" keeps the type comparable without raw text.
      if (isZ && method === "object") return "object";

      // z.string() / z.number() / ... — a base type.
      if (isZ) {
        const base = ZOD_BASE_TYPES.get(method);
        if (base) return base;
      }

      // z.coerce.number() — expr is `z.coerce` (a PropertyAccess whose object
      // is the z identifier); the type is the inner method name.
      if (
        obj &&
        obj.getKind() === SyntaxKind.PropertyAccessExpression &&
        obj.getExpression().getKind() === SyntaxKind.Identifier &&
        zNames.has(obj.getExpression().getText())
      ) {
        const inner = baseTypeOf(method);
        if (inner) return inner;
      }

      // Chained: z.string().url().optional() — recurse into the inner
      // expression.
      return zodFieldType(expr, zNames);
    }
  }

  // A reference to another schema or an unknown call — its text is the type.
  return node.getText();
};

// Collect the object-shape from a z.object(...) call, following .extend() chains.
const collectShape = (node, zNames) => {
  const props = [];
  const visit = (call) => {
    if (!call || call.getKind() !== SyntaxKind.CallExpression) return;
    const expr = call.getExpression();
    if (!expr || expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;
    const method = expr.getName();
    if (method !== "object" && method !== "extend") return;
    const arg = call.getArguments()[0];
    if (!arg || arg.getKind() !== SyntaxKind.ObjectLiteralExpression) return;
    for (const p of arg.getProperties()) {
      if (p.getKind() !== SyntaxKind.PropertyAssignment) continue;
      const nameNode = p.getName();
      const name = typeof nameNode === "string" ? nameNode : nameNode && nameNode.getText ? nameNode.getText() : null;
      if (!name) continue;
      const init = p.getInitializer();
      const type = init ? zodFieldType(init, zNames) : "unknown";
      props.push({ name, type, optional: false, readonly: false });
    }
  };
  visit(node);

  return props;
};

// Local names bound to a zod namespace: `import { z } from "zod"`,
// `import z from "zod"`, `import * as z from "zod"`, and re-exporting modules
// like chomp-2's `import { z } from "utils"` (detected by usage: `X.object(`).
const findZodNames = (sourceFile, text) => {
  const names = new Set();
  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifier();
    const moduleText = spec ? spec.getText().replace(/^["']|["']$/g, "") : "";
    const clause = imp.getImportClause();
    if (!clause) continue;
    const def = clause.getDefaultImport();
    if (def && moduleText === "zod") names.add(def.getText());
    const ns = clause.getNamespaceImport();
    if (ns && moduleText === "zod") names.add(ns.getText());
    for (const el of clause.getNamedImports()) {
      const local = localNameOf(el);
      // Named imports from "zod" (zod v4 style) or from any module when the
      // name is actually used as a zod namespace (`X.object(`).
      if (moduleText === "zod" || new RegExp(`\\b${local}\\.object\\s*\\(`).test(text)) names.add(local);
    }
  }
  return names;
};

const localNameOf = (spec) => {
  const text = spec.getText();
  const m = text.match(/\bas\s+([\w$]+)$/);
  return m ? m[1] : text;
};

const normalize = (entities, ctx) => {
  const sourceFile = ctx.sourceFile;
  const zNames = findZodNames(sourceFile, ctx.text);
  if (zNames.size === 0) return entities;

  const out = entities.filter((e) => e.kind !== "zod");
  const seen = new Set();

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
      if (!init || !isZodCall(init, zNames)) continue;
      const props = collectShape(init, zNames);
      if (props.length === 0) continue;
      const line = decl.getStartLineNumber();
      const endLine = decl.getEndLineNumber();
      const key = `${sourceFile.getFilePath()}|${line}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        id: `${sourceFile.getFilePath()}#${name}`,
        name,
        kind: "zod",
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
        framework: "zod",
        complexity: props.length,
      });
    }
  }

  return out;
};

module.exports = {
  id: "zod",
  detect: (text) => /from\s*["']zod["']/.test(text) || /\bz\.object\s*\(/.test(text),
  normalize,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Project, ScriptKind, SyntaxKind } = require("ts-morph");
const { canonicalType } = require("./types");

// ts-morph 28 returns generic (union-typed) nodes from getStatements()/
// getMembers() that lack the is* predicate methods. Every dispatch below is
// therefore kind-based, and every accessor call is guarded with typeof.

let project = null;

const getProject = () => {
  if (!project) project = new Project({ useInMemoryFileSystem: true });
  return project;
};

const available = () => true;

const isTestFile = (name) => /\.(test|spec|stories|e2e)\.[jt]sx?$/.test(name);

const scriptKindFor = (file) => {
  const ext = path.extname(file);
  if (ext === ".tsx") return ScriptKind.TSX;
  if (ext === ".jsx") return ScriptKind.JSX;
  return ScriptKind.TS;
};

// --- guarded helpers -------------------------------------------------------

const kind = (node) => (node ? node.getKind() : null);

const nameOf = (node) => {
  if (!node) return undefined;
  if (typeof node.getName === "function") {
    try {
      return node.getName();
    } catch {
      // fall through to the name node
    }
  }
  if (typeof node.getNameNode === "function") {
    const n = node.getNameNode();
    if (n) return n.getText();
  }
  return undefined;
};

const typeTextOf = (node) => {
  if (!node || typeof node.getTypeNode !== "function") return "unknown";
  const t = node.getTypeNode();
  return t ? canonicalType(t) : "unknown";
};

// --- export / top-level detection ------------------------------------------

const isExported = (node) => {
  let p = node;
  while (p && typeof p.getParent === "function") {
    const parent = p.getParent();
    if (!parent) return false;
    const k = parent.getKind();
    if (k === SyntaxKind.ExportDeclaration || k === SyntaxKind.ExportAssignment) return true;
    if (k === SyntaxKind.ModuleDeclaration) return false;
    p = parent;
  }
  return false;
};

const isTopLevel = (node, sourceFile) => {
  let p = node;
  while (p && typeof p.getParent === "function") {
    const parent = p.getParent();
    if (!parent) return false;
    if (parent === sourceFile) return true;
    const k = parent.getKind();
    if (k === SyntaxKind.ExportDeclaration) continue;
    return false;
  }
  return false;
};

// --- member extractors ------------------------------------------------------

const PARAM_PROP_MODIFIERS = new Set([
  SyntaxKind.ReadonlyKeyword,
  SyntaxKind.PrivateKeyword,
  SyntaxKind.ProtectedKeyword,
  SyntaxKind.PublicKeyword,
]);

const propFromMember = (m) => {
  const name = nameOf(m);
  if (!name) return null;
  const hasQuestion = typeof m.hasQuestionToken === "function" && m.hasQuestionToken();
  const readonly = typeof m.isReadonly === "function" && m.isReadonly();
  return { name, type: typeTextOf(m), optional: hasQuestion, readonly };
};

const methodFromMember = (m) => {
  const name = nameOf(m);
  if (!name) return null;
  const params =
    typeof m.getParameters === "function"
      ? m.getParameters().map((p) => {
          const t = typeof p.getTypeNode === "function" && p.getTypeNode();
          return t ? canonicalType(t) : "unknown";
        })
      : [];
  const ret =
    typeof m.getReturnType === "function" && m.getReturnType()
      ? canonicalType(m.getReturnType())
      : "void";
  return { name, params, returns: ret };
};

const extractClass = (node) => {
  const properties = [];
  const methods = [];
  const constructors = [];
  for (const m of node.getMembers()) {
    const k = m.getKind();
    if (k === SyntaxKind.PropertyDeclaration) {
      const prop = propFromMember(m);
      if (prop) properties.push(prop);
    } else if (
      k === SyntaxKind.MethodDeclaration ||
      k === SyntaxKind.GetAccessor ||
      k === SyntaxKind.SetAccessor
    ) {
      const method = methodFromMember(m);
      if (method) methods.push(method);
    } else if (k === SyntaxKind.Constructor) {
      const params =
        typeof m.getParameters === "function"
          ? m.getParameters()
          : [];
      for (const p of params) {
        const mods =
          typeof p.getModifiers === "function" && p.getModifiers()
            ? p.getModifiers().map((mod) => mod.getKind())
            : [];
        const isParamProp = mods.some((mk) => PARAM_PROP_MODIFIERS.has(mk));
        const pn = nameOf(p);
        if (isParamProp && pn && /^[A-Za-z_$][\w$]*$/.test(pn)) {
          properties.push({
            name: pn,
            type: typeTextOf(p),
            optional:
              typeof p.hasQuestionToken === "function" && p.hasQuestionToken(),
            readonly: false,
          });
        }
      }
      const ret =
        typeof m.getReturnType === "function" && m.getReturnType()
          ? canonicalType(m.getReturnType())
          : "void";
      constructors.push({ params: params.map((p) => typeTextOf(p)), returns: ret });
    }
  }
  const extends_ =
    typeof node.getExtends === "function" && node.getExtends()
      ? node.getExtends().getText()
      : null;
  const implements_ =
    typeof node.getImplements === "function" && node.getImplements()
      ? node.getImplements().map((i) => i.getText())
      : [];
  return { properties, methods, constructors, extends: extends_, implements: implements_ };
};

const extractInterface = (node) => {
  const properties = [];
  const methods = [];
  for (const m of node.getMembers()) {
    const k = m.getKind();
    if (k === SyntaxKind.PropertySignature) {
      const prop = propFromMember(m);
      if (prop) properties.push(prop);
    } else if (k === SyntaxKind.MethodSignature) {
      const method = methodFromMember(m);
      if (method) methods.push(method);
    } else if (
      k === SyntaxKind.CallSignature ||
      k === SyntaxKind.ConstructSignature
    ) {
      methods.push({ name: "(call)", params: [], returns: "unknown" });
    }
  }
  const ext = typeof node.getExtends === "function" ? node.getExtends() : null;
  const extends_ =
    ext && ext.length
      ? ext.map((e) => e.getText())
      : null;
  return { properties, methods, constructors: [], extends: extends_, implements: [] };
};

const extractTypeLiteral = (node) => {
  const properties = [];
  const methods = [];
  for (const m of node.getMembers()) {
    const k = m.getKind();
    if (k === SyntaxKind.PropertySignature) {
      const prop = propFromMember(m);
      if (prop) properties.push(prop);
    } else if (k === SyntaxKind.MethodSignature) {
      const method = methodFromMember(m);
      if (method) methods.push(method);
    }
  }
  return { properties, methods, constructors: [], extends: null, implements: [] };
};

// --- object literals (mobx stores, const shapes) ----------------------------

const objectLiteralMembers = (node) => {
  const members = [];
  if (!node || typeof node.getProperties !== "function") return members;
  for (const p of node.getProperties()) {
    const k = p.getKind();
    if (k === SyntaxKind.IndexSignature) continue;
    let name;
    if (k === SyntaxKind.PropertyAssignment) {
      name = nameOf(p);
    } else if (k === SyntaxKind.ShorthandPropertyAssignment) {
      const nn = typeof p.getNameNode === "function" ? p.getNameNode() : null;
      name = nn ? nn.getText() : undefined;
    } else {
      continue;
    }
    if (!name) continue;
    const init = typeof p.getInitializer === "function" ? p.getInitializer() : null;
    if (init && isFactoryFunction(init)) {
      const nested = factoryMembers(unwrapParens(init));
      if (nested.length > 0) {
        members.push(...nested);
      } else {
        // A function member whose body yields no object shape is kept as a
        // plain function property (e.g. `queryFn: () => null`).
        members.push({ name, type: "call" });
      }
    } else {
      members.push({ name, type: init ? inferExpressionType(init) : "unknown" });
    }
  }
  return members;
};

const unwrapParens = (node) => {
  let n = node;
  while (n && n.getKind() === SyntaxKind.ParenthesizedExpression && typeof n.getExpression === "function") {
    n = n.getExpression();
  }
  return n;
};

const isFactoryFunction = (node) => {
  if (!node) return false;
  const k = node.getKind();
  return (
    k === SyntaxKind.FunctionDeclaration ||
    k === SyntaxKind.FunctionExpression ||
    k === SyntaxKind.ArrowFunction
  );
};

const factoryMembers = (node) => {
  const members = [];
  if (!node) return members;
  const visit = (n) => {
    if (n.getKind() === SyntaxKind.ObjectLiteralExpression) {
      members.push(...objectLiteralMembers(n));
    }
  };
  const body = typeof node.getBody === "function" ? node.getBody() : null;
  if (body) {
    if (body.getKind() === SyntaxKind.ObjectLiteralExpression) {
      visit(body);
    } else {
      body.forEachChild(visit);
    }
  }
  return members;
};

const GENERIC_TYPES = new Set(["value", "object", "array", "call", "unknown"]);

const inferExpressionType = (node) => {
  if (!node) return "value";
  const k = node.getKind();
  if (k === SyntaxKind.ParenthesizedExpression) {
    return inferExpressionType(unwrapParens(node));
  }
  if (k === SyntaxKind.AsExpression && typeof node.getTypeNode === "function") {
    const t = node.getTypeNode();
    return t ? canonicalType(t) : "value";
  }
  if (k === SyntaxKind.TypeAssertionExpression && typeof node.getType === "function") {
    const t = node.getType();
    return t ? canonicalType(t) : "value";
  }
  switch (k) {
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return "string";
    case SyntaxKind.NumericLiteral:
      return "number";
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
      return "boolean";
    case SyntaxKind.ObjectLiteralExpression:
      return "object";
    case SyntaxKind.ArrayLiteralExpression:
      return "array";
    case SyntaxKind.CallExpression:
      return "call";
    default:
      return "value";
  }
};

// --- imports / uses ----------------------------------------------------------

const localNameOf = (spec) => {
  const text = spec.getText();
  const m = text.match(/\bas\s+([\w$]+)$/);
  return m ? m[1] : text;
};

const collectImports = (sourceFile) => {
  const names = new Set();
  for (const imp of sourceFile.getImportDeclarations()) {
    const clause = imp.getImportClause();
    if (!clause) continue;
    const def = clause.getDefaultImport();
    if (def) names.add(def.getText());
    for (const el of clause.getNamedImports()) names.add(localNameOf(el));
    const ns = clause.getNamespaceImport();
    if (ns) names.add(ns.getText());
  }
  return names;
};

const collectLocalNames = (sourceFile) => {
  const names = new Set();
  sourceFile.forEachDescendant((node) => {
    if (typeof node.getNameNode !== "function") return;
    const nn = node.getNameNode();
    if (nn && nn.getKindName() === "Identifier") names.add(nn.getText());
  });
  return names;
};

const collectUses = (sourceFile, ownName, localNames, importSet) => {
  const uses = new Set();
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.Identifier) return;
    const text = node.getText();
    if (text === ownName) return;
    if (localNames.has(text)) return;
    if (importSet.has(text)) return;
    uses.add(text);
  });
  return uses;
};

// --- statement dispatch ------------------------------------------------------

const handleStatement = (node, push) => {
  const k = node.getKind();
  if (k === SyntaxKind.ClassDeclaration) {
    const name = nameOf(node);
    if (!name) return;
    const { properties, methods, constructors, extends: ext, implements: impls } = extractClass(node);
    push(name, node, {
      kind: "class",
      properties,
      methods,
      constructors,
      extends: ext,
      implements: impls,
    });
  } else if (k === SyntaxKind.InterfaceDeclaration) {
    const name = nameOf(node);
    if (!name) return;
    const { properties, methods, extends: ext } = extractInterface(node);
    push(name, node, {
      kind: "interface",
      properties,
      methods,
      constructors: [],
      extends: ext,
      implements: [],
    });
  } else if (k === SyntaxKind.TypeAliasDeclaration) {
    const name = nameOf(node);
    if (!name) return;
    const typeNode = typeof node.getTypeNode === "function" ? node.getTypeNode() : null;
    if (!typeNode || typeNode.getKind() !== SyntaxKind.TypeLiteral) return;
    const { properties, methods } = extractTypeLiteral(typeNode);
    push(name, node, {
      kind: "type",
      properties,
      methods,
      constructors: [],
      extends: null,
      implements: [],
    });
  } else if (k === SyntaxKind.VariableStatement) {
    const decls =
      typeof node.getDeclarationList === "function" ? node.getDeclarationList().getDeclarations() : [];
    for (const decl of decls) {
      const nn = typeof decl.getNameNode === "function" ? decl.getNameNode() : null;
      if (!nn || nn.getKindName() !== "Identifier") continue;
      const name = nn.getText();
      const init = typeof decl.getInitializer === "function" ? decl.getInitializer() : null;
      if (!init) continue;
      if (init.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const properties = objectLiteralMembers(unwrapParens(init));
        push(name, node, {
          kind: "object",
          properties,
          methods: [],
          constructors: [],
          extends: null,
          implements: [],
        });
      } else if (isFactoryFunction(unwrapParens(init))) {
        const properties = factoryMembers(unwrapParens(init));
        if (properties.length === 0) continue;
        push(name, node, {
          kind: "object",
          properties,
          methods: [],
          constructors: [],
          extends: null,
          implements: [],
        });
      }
    }
  } else if (k === SyntaxKind.FunctionDeclaration) {
    const name = nameOf(node);
    if (!name) return;
    const properties = factoryMembers(node);
    if (properties.length > 0) {
      push(name, node, {
        kind: "object",
        properties,
        methods: [],
        constructors: [],
        extends: null,
        implements: [],
      });
    }
  }
};

// --- public API ---------------------------------------------------------------

const parseAndExtract = (filePath, opts = {}) => {
  const { requireExported = false } = opts;
  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = getProject().createSourceFile(filePath, text, {
    scriptKind: scriptKindFor(filePath),
    overwrite: true,
  });

  const entities = [];
  const push = (name, node, extracted) => {
    const exported = isExported(node);
    if (requireExported && !exported) return;
    const topLevel = isTopLevel(node, sourceFile);
    const startLine = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    const base = {
      id: `${filePath}#${name}`,
      name,
      kind: extracted.kind,
      sourceFile: filePath,
      line: startLine,
      endLine,
      exported,
      properties: extracted.properties,
      methods: extracted.methods,
      constructors: extracted.constructors,
      extends: extracted.extends,
      implements: extracted.implements,
      uses: [],
      imports: [],
      framework: null,
      complexity: extracted.properties.length + extracted.methods.length,
    };
    entities.push({ ...base, topLevel });
  };

  for (const stmt of sourceFile.getStatements()) {
    let node = stmt;
    if (stmt.getKind() === SyntaxKind.ExportDeclaration) {
      const inner = typeof stmt.getStatement === "function" ? stmt.getStatement() : null;
      if (inner) node = inner;
    }
    handleStatement(node, push);
  }

  const importSet = collectImports(sourceFile);
  const localNames = collectLocalNames(sourceFile);
  for (const e of entities) {
    e.imports = [...importSet];
    e.uses = [...collectUses(sourceFile, e.name, localNames, importSet)];
  }

  // Flat context: consumers (tests, main.js, framework normalizers) read
  // `ctx.entities`, `ctx.sourceFile`, `ctx.text`, `ctx.imports` directly.
  return { entities, sourceFile, text, imports: importSet };
};

const extractFromFile = (filePath, opts = {}) => {
  if (isTestFile(filePath)) return [];
  return parseAndExtract(filePath, opts).entities;
};

module.exports = {
  parseAndExtract,
  extractFromFile,
  available,
  canonicalType,
  objectLiteralMembers,
  inferExpressionType,
  isFactoryFunction,
  factoryMembers,
  collectImports,
  collectLocalNames,
  collectUses,
  GENERIC_TYPES,
};

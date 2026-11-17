// Apollo fragment composition normalizer.
//
// `gql\`fragment X on T { ...Base ...fields }\`` is a COMPOSED field set: the
// spread `...Base` includes another fragment's fields (heritage), the literal
// selections are its own fields. Fragments are not TypeScript types, so the
// base normalizer never sees them; this extracts each named fragment as an
// entity whose properties are the selected field names and whose `extends`
// are the spread fragments — so the inheritance matcher sees the reuse chain
// BaseUser ⊂ AdminUser ⊂ ExtendedAdmin.

import { SyntaxKind } from "ts-morph";

const detect = (text) => /from\s*["'][^"']*@apollo\/client["']/.test(text) || /\bgql\s*`/.test(text);

const call = (node, method, ...args) => (node && typeof node[method] === "function" ? node[method](...args) : undefined);

/** The variable a tagged template is bound to, or null. */
const boundName = (node) => {
	let parent = node;
	while (parent && typeof parent.getParent === "function") {
		const p = parent.getParent();
		if (!p) return null;
		if (p.getKind() === SyntaxKind.VariableDeclaration) {
			const nn = call(p, "getNameNode");
			return nn && nn.getKindName() === "Identifier" ? nn.getText() : null;
		}
		if (p.getKind() === SyntaxKind.VariableStatement) return null;
		parent = p;
	}

	return null;
};

/** Parse one `fragment Name on Type { body }` out of a gql template text. */
const parseFragment = (text) => {
	const m = text.match(/fragment\s+([A-Za-z0-9_]+)\s+on\s+([A-Za-z0-9_]+)\s*\{([\s\S]*)\}/);
	if (!m) return null;
	const body = m[3];
	const spreads = [...body.matchAll(/\.\.\.([A-Za-z0-9_]+)/g)].map((x) => x[1]);
	// Own fields: top-level identifiers that are not spreads/interpolations.
	const cleaned = body.replace(/\.\.\.[A-Za-z0-9_]+/g, "").replace(/\$\{[^}]*\}/g, "");
	const fields = [];
	const fieldRe = /(^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=[\n{]|\s*$)/g;
	let f;
	while ((f = fieldRe.exec(cleaned)) !== null) fields.push(f[2]);

	return { name: m[1], on: m[2], spreads, fields: [...new Set(fields)] };
};

const normalize = (entities, ctx) => {
	const sourceFile = ctx.sourceFile;
	if (!sourceFile) return entities;
	const out = [...entities];
	const seen = new Set();

	sourceFile.forEachDescendant((node) => {
		if (node.getKind() !== SyntaxKind.TaggedTemplateExpression) return;
		const tag = call(node, "getTag");
		if (!tag || tag.getText() !== "gql") return;
		const name = boundName(node);
		if (!name || seen.has(name)) return;
		const template = call(node, "getTemplate");
		const text = template ? call(template, "getText") : "";
		const frag = parseFragment(text);
		if (!frag) return;
		seen.add(name);
		const line = call(node, "getStartLineNumber") ?? 1;
		out.push({
			id: `${sourceFile.getFilePath()}#${name}`,
			// The entity IS the fragment: its name is the fragment name, so a
			// `...BaseUser` spread resolves to the BaseUser entity by name.
			name: frag.name,
			kind: "object",
			sourceFile: sourceFile.getFilePath(),
			line,
			endLine: call(node, "getEndLineNumber") ?? line,
			exported: false,
			properties: frag.fields.map((f) => ({ name: f, type: "object" })),
			methods: [],
			constructors: [],
			extends: frag.spreads.length === 1 ? frag.spreads[0] : frag.spreads.length > 1 ? frag.spreads : null,
			implements: [],
			uses: [],
			imports: [...ctx.imports],
			framework: "apollo",
			complexity: frag.fields.length,
			fragmentOn: frag.on,
		});
	});

	return out;
};

export const id = "apollo";
export { detect, normalize, parseFragment };

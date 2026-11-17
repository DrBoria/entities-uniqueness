"use strict";

// EFFECTIVE heritage — the transitive closure of `extends` / `implements` /
// MST `types.compose` bases, resolved against the project's entity index.
//
// `class UserStore extends ApiStore` and `class AdminStore extends ApiStore`
// share ApiStore directly. But `class UserStore extends ApiStore` (ApiStore
// extends BaseStore) and `class AuditStore extends BaseStore` share BaseStore
// only TRANSITIVELY — the raw heritage sets miss it. The closure walks every
// named base that is itself an entity in the scanned set, so a grandchild and
// a child of the same root agree on that root.
//
// The index is `path#name` → entity (the same map the report builds). Bases
// are matched by NAME across the index (a base is written without its path);
// a name declared in several files resolves to every declaration — heritage
// is a name-level fact, not a file-level one.

const listOf = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

/** A base is written as a name, possibly with type arguments
 *  (`EntityStore<User>`) — the heritage fact is the bare name. */
const baseName = (text) => String(text).replace(/<[\s\S]*$/, "").trim();

/** Direct heritage names of one entity (extends ∪ implements), bare names. */
const directHeritage = (e) => [...listOf(e?.extends), ...listOf(e?.implements)].filter((x) => typeof x === "string" && x.length > 0).map(baseName);

/** Index entities by bare name (a base is written without its path). */
const byNameIndex = (entities) => {
	const map = new Map();
	for (const e of entities ?? []) {
		if (!e || !e.name) continue;
		const list = map.get(e.name) ?? [];
		list.push(e);
		map.set(e.name, list);
	}

	return map;
};

/** The transitive closure of one entity's BASES (its own name is not a base).
 *  A child of Base carries Base; a grandchild carries Base through its parent. */
const closureOf = (entity, index, seen = new Set()) => {
	const out = new Set();
	for (const base of directHeritage(entity)) {
		if (seen.has(base)) continue;
		seen.add(base);
		out.add(base);
		for (const decl of index.get(base) ?? []) {
			for (const up of closureOf(decl, index, seen)) out.add(up);
		}
	}

	return out;
};

/** Effective heritage sets of a pair: each side's transitive bases PLUS its
 *  own name when the other side descends from it (a parent and its child share
 *  the parent). Two unrelated entities never gain evidence from their names. */
const effectiveHeritage = (a, b, entities) => {
	const index = byNameIndex(entities);
	const A = closureOf(a, index);
	const B = closureOf(b, index);
	if (a?.name && B.has(a.name)) A.add(a.name);
	if (b?.name && A.has(b.name)) B.add(b.name);

	return { A, B };
};

export { directHeritage, effectiveHeritage, byNameIndex, closureOf };

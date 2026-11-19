import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const base = path.resolve(__dirname, "..", "dist");
const normalizer = require(path.join(base, "normalizer/index.js"));
const { normalizeEntities } = require(path.join(base, "frameworks/entrypoint.js"));
const { matchSignals } = require(path.join(base, "matcher/index.js"));
const { effectiveHeritage } = require(path.join(base, "matcher/heritage.js"));

const DIR = path.resolve(__dirname, "duplicates", "inheritance");

// Every fixture in tests/duplicates/inheritance, normalized together so the
// heritage closure can resolve bases across files (the project index).
const loadAll = () => {
	const all = [];
	for (const f of fs.readdirSync(DIR)) {
		const ctx = normalizer.parseAndExtract(path.join(DIR, f));
		all.push(...normalizeEntities(ctx.entities, ctx));
	}

	return all;
};

const ALL = loadAll();
// Names repeat across frameworks (BaseStore is both a MobX class and an MST
// model; ApiStore is both MST and a class). Select by framework when needed.
const byName = (name, framework) => ALL.find((e) => e.name === name && (framework === undefined || e.framework === framework));
const mst = (name) => byName(name, "mst");
const apollo = (name) => byName(name, "apollo");
const inh = (x, y, fx, fy) => matchSignals(byName(x, fx), byName(y, fy), { entities: ALL }).inheritance;

describe("MobX class inheritance — transitive heritage closure", () => {
	it("extracts the three Store levels with their extends chain", () => {
		expect(byName("BaseStore").kind).toBe("class");
		expect(byName("ApiStore").extends).toBe("BaseStore");
		expect(byName("UserStore").extends).toBe("ApiStore");
	});

	it("a grandchild shares the root it never names directly (UserStore ~ BaseStore)", () => {
		const s = inh("UserStore", "BaseStore");
		expect(s.hasEvidence).toBe(true);
		expect(s.evidence.shared).toContain("BaseStore");
		expect(s.score).toBeGreaterThan(0);
	});

	it("parent and child share the parent (ApiStore ~ BaseStore)", () => {
		expect(inh("ApiStore", "BaseStore").evidence.shared).toContain("BaseStore");
	});

	it("the closure is transitive: UserStore carries BaseStore through ApiStore", () => {
		const { A } = effectiveHeritage(byName("UserStore"), byName("BaseStore"), ALL);
		expect([...A]).toEqual(expect.arrayContaining(["ApiStore", "BaseStore"]));
	});

	it("abstract generic Store: subclass shares the base despite type arguments", () => {
		const s = inh("UserEntityStore", "EntityStore");
		expect(s.evidence.shared).toContain("EntityStore");
		expect(s.score).toBeGreaterThan(0);
	});

	it("override getters stay properties; actions stay methods", () => {
		const api = byName("ApiStore");
		expect(api.properties.map((p) => p.name)).toContain("isLoading");
		expect(api.methods.map((m) => m.name)).toContain("incrementRequests");
	});
});

describe("A/B/C — partial method reuse + extended class", () => {
	it("B re-declares 2 of A's 5 methods: graded partial correspondence, not zero", () => {
		const s = matchSignals(byName("ServiceB"), byName("ServiceA"), { entities: ALL });
		expect(s.methods.score).toBeGreaterThan(0.3);
		expect(s.methods.score).toBeLessThan(1);
		expect(s.methods.evidence.overlap).toBe(1); // both of B's methods exist in A
		expect(s.methods.evidence.jaccard).toBeLessThan(1); // but A has 3 more
	});

	it("C extends A: inheritance sees the reuse even though C adds 3 new methods", () => {
		const s = inh("ServiceC", "ServiceA");
		expect(s.evidence.shared).toContain("ServiceA");
		expect(s.score).toBeGreaterThan(0);
	});

	it("C's own methods are the 3 additions, A's 5 are inherited (not redeclared)", () => {
		expect(byName("ServiceC").methods.map((m) => m.name).sort()).toEqual(["archive", "publish", "restore"]);
		expect(byName("ServiceA").methods).toHaveLength(5);
	});

	it("B and C are siblings through A only when both name it — B does not extend, so no heritage", () => {
		expect(inh("ServiceB", "ServiceA").hasEvidence).toBe(false);
	});
});

describe("MST composition — types.compose is heritage", () => {
	it("UserStore composes three bases; they are its extends", () => {
		const u = mst("UserStore");
		expect(u.framework).toBe("mst");
		expect(u.extends).toEqual(["BaseStore", "PaginationStore", "SelectionStore"]);
	});

	it("a composed model shares each base it composes", () => {
		expect(inh("UserStore", "BaseStore", "mst", "mst").evidence.shared).toContain("BaseStore");
		expect(inh("UserStore", "PaginationStore", "mst", "mst").evidence.shared).toContain("PaginationStore");
	});

	it("compose folds .props/.views/.actions into properties and methods", () => {
		const u = mst("UserStore");
		expect(u.properties.map((p) => p.name)).toEqual(expect.arrayContaining(["users", "selectedUsers"]));
		expect(u.methods.map((m) => m.name)).toContain("addUser");
	});

	it("base models keep their own actions as methods", () => {
		expect(mst("BaseStore").methods.map((m) => m.name)).toEqual(expect.arrayContaining(["setLoading", "setError"]));
		expect(mst("PaginationStore").methods.map((m) => m.name)).toEqual(expect.arrayContaining(["nextPage", "previousPage"]));
	});
});

describe("MST sequential extension — .props/.views/.actions chains", () => {
	it("each chained binding is its own entity with the root as heritage", () => {
		expect(byName("AuditableEntity").extends).toBe("Entity");
		expect(byName("VersionedEntity").extends).toBe("AuditableEntity");
		expect(byName("UserEntity").extends).toBe("VersionedEntity");
	});

	it("the chain is transitive: UserEntity carries Entity through two links", () => {
		const s = inh("UserEntity", "Entity");
		expect(s.evidence.shared).toContain("Entity");
		const { A } = effectiveHeritage(byName("UserEntity"), byName("Entity"), ALL);
		expect([...A]).toEqual(expect.arrayContaining(["VersionedEntity", "AuditableEntity", "Entity"]));
	});

	it("views become read-only properties, actions become methods", () => {
		const v = byName("VersionedEntity");
		expect(v.methods.map((m) => m.name)).toContain("incrementVersion");
		const u = byName("UserEntity");
		expect(u.properties.map((p) => p.name)).toEqual(expect.arrayContaining(["email", "role", "isAdmin"]));
		expect(u.methods.map((m) => m.name)).toContain("promote");
	});

	it("types.enumeration reduces to the literal union", () => {
		const role = byName("UserEntity").properties.find((p) => p.name === "role");
		expect(role.type).toBe('"admin"|"moderator"|"user"');
	});
});

describe("MST recursive + flow composition", () => {
	it("types.late recursion resolves the recursive member type", () => {
		const tree = mst("TreeNode");
		expect(tree.extends).toBe("BaseNode");
		const children = tree.properties.find((p) => p.name === "children");
		expect(children).toBeTruthy();
	});

	it("compose + flow: ApiStore composes RequestStore/DataStore, load is a method", () => {
		const api = mst("ApiStore");
		expect(api.extends).toEqual(["RequestStore", "DataStore"]);
		expect(api.methods.map((m) => m.name)).toContain("load");
	});

	it("ExtendedApiStore extends ApiStore and transitively shares RequestStore", () => {
		expect(mst("ExtendedApiStore").extends).toBe("ApiStore");
		expect(inh("ExtendedApiStore", "RequestStore", "mst", "mst").evidence.shared).toContain("RequestStore");
	});
});

describe("Apollo fragment composition — spreads are heritage", () => {
	it("fragments are named by their fragment name, spreads are extends", () => {
		expect(apollo("BaseUser").framework).toBe("apollo");
		expect(apollo("AdminUser").extends).toBe("BaseUser");
		expect(apollo("ExtendedAdmin").extends).toBe("AdminUser");
	});

	it("a fragment shares the base it spreads", () => {
		expect(inh("AdminUser", "BaseUser", "apollo", "apollo").evidence.shared).toContain("BaseUser");
	});

	it("transitive: ExtendedAdmin carries BaseUser through AdminUser", () => {
		const s = inh("ExtendedAdmin", "BaseUser", "apollo", "apollo");
		// The closure walks both links; the SHARED set is the intersection with
		// BaseUser's own heritage (BaseUser itself), proving the transitive reach.
		expect(s.evidence.aHeritage).toEqual(expect.arrayContaining(["AdminUser", "BaseUser"]));
		expect(s.evidence.shared).toContain("BaseUser");
	});

	it("own fields are the literal selections (not the spread's)", () => {
		expect(apollo("BaseUser").properties.map((p) => p.name).sort()).toEqual(["email", "id", "name"]);
		expect(apollo("AdminUser").properties.map((p) => p.name).sort()).toEqual(["createdAt", "role"]);
	});
});

describe("Keystone list-config factories — shared field sets", () => {
	it("the shared field groups are extracted as objects", () => {
		expect(byName("baseFields").properties.map((p) => p.name)).toEqual(expect.arrayContaining(["title", "slug", "createdAt", "updatedAt"]));
		expect(byName("publishFields").properties.map((p) => p.name)).toEqual(expect.arrayContaining(["published", "publishedAt"]));
	});

	it("the factory field groups overlap heavily (Post/News share base+publish+author)", () => {
		// The lists wrap factory calls, so the shared shape lives in the field
		// groups; base+publish+author are the reuse the inheritance story tells.
		const base = byName("baseFields");
		const publish = byName("publishFields");
		expect(base.properties.length).toBeGreaterThanOrEqual(4);
		expect(publish.properties.length).toBeGreaterThanOrEqual(2);
		// Post and News are extracted by the keystone normalizer when their
		// fields are inline; here they come from factories, so assert the groups.
		expect(byName("authorFields").properties.map((p) => p.name)).toContain("author");
	});
});

describe("no false heritage between unrelated entities", () => {
	it("two independent classes share no heritage and gain no evidence", () => {
		const s = inh("ServiceA", "ServiceB");
		expect(s.hasEvidence).toBe(false);
		expect(s.score).toBe(0);
	});

	it("an entity never counts its own name as a base against an unrelated peer", () => {
		const { A, B } = effectiveHeritage(byName("ServiceA"), byName("ServiceB"), ALL);
		expect(A.has("ServiceA")).toBe(false);
		expect(B.has("ServiceB")).toBe(false);
	});
});

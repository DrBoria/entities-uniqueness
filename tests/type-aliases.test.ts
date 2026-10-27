import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const main = require("../main.js");
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");
const { matchSignals } = require("../matcher/index.js");
const { decide } = require("../decision-maker.js");

const pluginDir = path.resolve(__dirname, "..");
const ENTITIES_ROOT = "tests/entities";

const parseFixture = (rel) => {
	const ctx = normalizer.parseAndExtract(path.join(pluginDir, rel));
	const entities = normalizeEntities(ctx.entities, ctx);

	return { ctx, entities };
};

const byName = (entities, name) => entities.find((e) => e.name === name);

const pairNames = (m) => [m.a.name, m.b.name].sort().join("|");

describe("TypeAliasDeclaration extraction (MST fixture)", () => {
	const { entities } = parseFixture(path.join(ENTITIES_ROOT, "mst", "document-type.ts"));

	it("extracts the store model as a framework entity with canonical properties", () => {
		const store = byName(entities, "DocumentStoreModel");
		expect(store).toBeTruthy();
		expect(store.kind).toBe("object");
		expect(store.framework).toBe("mst");
		expect(store.storeModel).toBe(true);
		expect(store.modelName).toBe("DocumentStore");

		const prop = (n) => store.properties.find((p) => p.name === n);
		expect(prop("document").type).toBe("DocumentView");
		expect(prop("changedUglies").type).toBe("boolean");
		expect(prop("hiddenDecoration").type).toBe("string?");
		expect(prop("hideTextMethod").type).toBe("HideTextMethod");
		expect(prop("currentDecorations").type).toBe("UpdateDecorationEntry[]");
		expect(prop("lastSelections").type).toBe("Map<TextEditor, Selection[]>");
	});

	it("extracts the hand-written type copy with properties and methods", () => {
		const data = byName(entities, "DocumentData");
		expect(data).toBeTruthy();
		expect(data.kind).toBe("type");
		expect(data.properties.length).toBeGreaterThanOrEqual(20);
		expect(data.methods.length).toBeGreaterThanOrEqual(12);
		expect(data.properties.map((p) => p.name)).toContain("document");
		expect(data.methods.map((m) => m.name)).toContain("disposeModel");
	});

	it("extracts the alias duplicate with aliasOf set", () => {
		const pretty = byName(entities, "PrettyModelData");
		expect(pretty).toBeTruthy();
		expect(pretty.kind).toBe("type");
		expect(pretty.aliasOf).toBe("DocumentData");
	});

	it("does not extract the generated Instance<typeof X> types", () => {
		expect(byName(entities, "DocumentStore")).toBeUndefined();
		expect(byName(entities, "ResolveStore")).toBeUndefined();
	});

	it("flags the alias duplicate via the alias fast path", () => {
		const pretty = byName(entities, "PrettyModelData");
		const data = byName(entities, "DocumentData");
		const signals = matchSignals(pretty, data, {});
		const decision = decide(pretty, data, { signals });

		expect(decision.isDuplicate).toBe(true);
		expect(decision.tier).toBe("duplicate");
		expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
		expect(decision.reason).toMatch(/alias/);
	});

	it("flags the hand-written copy of the store model as a duplicate", () => {
		const data = byName(entities, "DocumentData");
		const store = byName(entities, "DocumentStoreModel");
		const signals = matchSignals(data, store, {});
		const decision = decide(data, store, { signals });

		expect(decision.isDuplicate).toBe(true);
		expect(decision.tier).toBe("duplicate");
		expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
		expect(decision.reason).toMatch(/store-model copy/);
	});
});

describe("full pipeline over the new fixtures", () => {
	const config = main.buildConfig(pluginDir, null, {
		roots: [ENTITIES_ROOT],
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
	});
	const result = main.run(config);

	it("flags the MST alias and store-model-copy pairs as duplicates", () => {
		const aliasDup = result.matches.find((m) => pairNames(m) === "DocumentData|PrettyModelData");
		expect(aliasDup).toBeTruthy();
		expect(aliasDup.tier).toBe("duplicate");
		expect(aliasDup.decision.confidence).toBeGreaterThanOrEqual(0.85);

		const copyDup = result.matches.find((m) => pairNames(m) === "DocumentData|DocumentStoreModel");
		expect(copyDup).toBeTruthy();
		expect(copyDup.tier).toBe("duplicate");
		expect(copyDup.decision.confidence).toBeGreaterThanOrEqual(0.85);
	});

	it("flags the apollo-style identical type shapes as duplicates", () => {
		const dup = result.matches.find((m) => pairNames(m) === "TokenQuery|TokenQueryCopy");
		expect(dup).toBeTruthy();
		expect(dup.tier).toBe("duplicate");
	});

	it("does not flag the two keystone list() schemas as duplicates of each other", () => {
		const pair = result.matches.find((m) => pairNames(m) === "Post|Role");
		expect(pair).toBeFalsy();
	});

	it("extracts the keystone list() schemas as object entities", () => {
		const post = result.entities.find((e) => e.name === "Post");
		const role = result.entities.find((e) => e.name === "Role");
		expect(post).toBeTruthy();
		expect(post.kind).toBe("object");
		expect(role).toBeTruthy();
		expect(role.kind).toBe("object");
	});
});

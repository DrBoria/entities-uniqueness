import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const main = require("../main.js");
const { findCandidates } = require("../matcher/candidates.js");
const { decideFacts } = require("../decision-maker.js");
const { buildTrees } = require("../tree-builder.js");
const { renderEntityReport } = require("../report.js");

const pluginDir = path.resolve(__dirname, "..");
const TREES_ROOT = "tests/duplicates/trees";

const buildConfig = (overrides = {}) => {
	const args = {
		roots: [TREES_ROOT],
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
		...overrides,
	};

	return main.buildConfig(pluginDir, null, args);
};

const pairKey = (c) => [c.a.name, c.b.name].sort().join("|");

const runStages = (config) => {
	const { entities } = main.run(config);
	const candidates = findCandidates(entities, { ignoredMembers: config.ignoredMembers, tuning: config.tuning });
	const facts = decideFacts(candidates, { weights: config.weights, thresholds: config.thresholds, tuning: config.tuning });
	const trees = buildTrees(facts, entities);

	return { entities, candidates, facts, trees };
};

describe("candidate matcher (raw, pre-decision)", () => {
	it("emits a subset candidate with rawMetrics for a containment pair", () => {
		const config = buildConfig();
		const { candidates } = runStages(config);

		const sub = candidates.find((c) => c.kind === "subset" && pairKey(c) === "Address|LocalAddress");
		expect(sub).toBeTruthy();
		expect(sub.rawMetrics).toBeTruthy();
		expect(sub.rawMetrics.jaccard).toBeGreaterThan(0);
		expect(sub.rawMetrics.overlap).toBe(1);
		expect(sub.rawMetrics.sizeDiff).toBe(1);
	});

	it("emits an intersection candidate for a similar-size large-overlap pair", () => {
		const config = buildConfig();
		const { candidates } = runStages(config);

		const inter = candidates.find((c) => c.kind === "intersection" && pairKey(c) === "CartLine|OrderLine");
		expect(inter).toBeTruthy();
		expect(inter.rawMetrics.overlap).toBeGreaterThanOrEqual(0.6);
		expect(inter.rawMetrics.sizeDiff).toBe(0);
	});

	it("emits no candidate for unrelated shapes", () => {
		const config = buildConfig();
		const { candidates } = runStages(config);

		const none = candidates.find((c) => pairKey(c) === "Address|OrderLine");
		expect(none).toBeFalsy();
	});
});

describe("decision maker (decideFacts, one pass)", () => {
	it("turns subset candidates into inclusion facts (parent=larger, child=smaller)", () => {
		const config = buildConfig();
		const { facts } = runStages(config);

		const inc = facts.find((f) => f.type === "inclusion" && f.parent.name === "Address" && f.child.name === "LocalAddress");
		expect(inc).toBeTruthy();
		expect(inc.score).toBeGreaterThanOrEqual(0);
	});

	it("turns intersection candidates into extract facts with the shared members", () => {
		const config = buildConfig();
		const { facts } = runStages(config);

		const ext = facts.find((f) => f.type === "extract" && [f.left.name, f.right.name].sort().join("|") === "CartLine|OrderLine");
		expect(ext).toBeTruthy();
		expect(ext.shared).toEqual(expect.arrayContaining(["sku", "qty", "price"]));
		expect(ext.suggest).toBeTruthy();
	});
});

describe("tree builder (dumb assembler)", () => {
	it("builds a forest with the biggest entity at the root", () => {
		const config = buildConfig();
		const { trees } = runStages(config);

		const tree = trees.trees.find((t) => t.entity.name === "Address");
		expect(tree).toBeTruthy();
		const childNames = tree.children.map((c) => c.entity.name);
		expect(childNames).toContain("LocalAddress");
		// CityZip is the tightest child of LocalAddress, not directly under Address.
		const local = tree.children.find((c) => c.entity.name === "LocalAddress");
		expect(local.children.map((c) => c.entity.name)).toContain("CityZip");
	});

	it("keeps extract candidates as a flat list next to the trees", () => {
		const config = buildConfig();
		const { trees } = runStages(config);

		expect(trees.extracts.length).toBeGreaterThanOrEqual(1);
		const names = trees.extracts.map((e) => [e.left.name, e.right.name].sort().join("|"));
		expect(names).toContain("CartLine|OrderLine");
	});
});

describe("report renders trees + shared-entity suggestions", () => {
	it("renders a 'Duplicates of <root>' tree and shared-entity suggestions", () => {
		const config = buildConfig();
		const result = main.run(config);
		const md = renderEntityReport(result);

		expect(md).toMatch(/Duplicates of Address/);
		expect(md).toMatch(/LocalAddress/);
		expect(md).toMatch(/CityZip/);
		expect(md).toMatch(/sku/);
		expect(md).toMatch(/CartLine/);
	});
});

describe("type-aware scoring (audit fixes)", () => {
	it("scores a type-mismatched intersection below 1.0 (FaqA vs FaqB)", () => {
		const config = buildConfig();
		const { facts } = runStages(config);

		const ext = facts.find((f) => f.type === "extract" && [f.left.name, f.right.name].sort().join("|") === "FaqA|FaqB");
		expect(ext).toBeTruthy();
		// Same names, different `answer` type -> must NOT be a perfect 1.0.
		expect(ext.score).toBeLessThan(1);
	});

	it("discounts a tiny true name+type match below 1.0 (FaqA vs FaqC)", () => {
		const config = buildConfig();
		const { facts } = runStages(config);

		const ext = facts.find((f) => f.type === "extract" && [f.left.name, f.right.name].sort().join("|") === "FaqA|FaqC");
		expect(ext).toBeTruthy();
		// FaqC is identical to FaqA, but both are two-field shapes: a full
		// name+type match on a tiny body is still not a meaningful "identical",
		// so the small/tiny-shape discounts keep it below the 1.00 ceiling.
		expect(ext.score).toBeGreaterThan(0);
		expect(ext.score).toBeLessThan(1);
	});
});

describe("subset orientation by unique names (audit fix)", () => {
	it("orients parent/child by the unique-name set, not raw length (FooterAction is parent)", () => {
		const config = buildConfig();
		const { facts } = runStages(config);

		const inc = facts.find((f) => f.type === "inclusion" && [f.parent.name, f.child.name].sort().join("|") === "FooterAction|actions");
		expect(inc).toBeTruthy();
		expect(inc.parent.name).toBe("FooterAction");
		expect(inc.child.name).toBe("actions");
		// child must be a genuine subset of parent by name.
		const parentNames = new Set(inc.parent.properties.map((p) => p.name));
		for (const p of inc.child.properties) expect(parentNames.has(p.name)).toBe(true);
	});
});



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

const IGNORED = ["id", "name", "code", "label", "value", "type", "status"];

const buildConfig = (roots, overrides = {}) => {
	const args = {
		roots,
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
		ignoredMembers: IGNORED,
		...overrides,
	};

	return main.buildConfig(pluginDir, null, args);
};

const runStages = (config) => {
	const { entities } = main.run(config);
	const candidates = findCandidates(entities, { ignoredMembers: config.ignoredMembers, tuning: config.tuning });
	const facts = decideFacts(candidates, { weights: config.weights, thresholds: config.thresholds, tuning: config.tuning, ignoredMembers: config.ignoredMembers });
	const trees = buildTrees(facts, entities);

	return { entities, candidates, facts, trees };
};

// BUG F: containment is decided on the IGNORED-filtered name set, but the
// parent/child orientation used to be decided on the RAW name count. A shape
// that is small after filtering but carries many ignored props (id, name,
// code, ...) used to be oriented as the *parent*. Orientation must use the
// same filtered set as the containment test.
describe("BUG F: orientation uses the filtered name set", () => {
	it("orients the containing shape as parent even when the child has more raw names", () => {
		const config = buildConfig(["tests/duplicates/trees-orient"]);
		const { facts } = runStages(config);

		const inc = facts.find((f) => f.type === "inclusion" && [f.parent.name, f.child.name].sort().join("|") === "Child|Parent");
		expect(inc).toBeTruthy();
		expect(inc.parent.name).toBe("Parent");
		expect(inc.child.name).toBe("Child");
	});
});

// BUG D: a parent whose only children all attach to a *tighter* parent ends up
// as a single-node "Duplicate tree" — it has no duplicates at all and must not
// be rendered as one.
describe("BUG D: single-node trees are dropped", () => {
	it("does not emit a root that has no children after tightest-parent nesting", () => {
		const config = buildConfig(["tests/duplicates/trees-orient"]);
		const { trees } = runStages(config);

		// DrLeaf attaches to the tighter DrSib, leaving DrParent childless.
		const drParent = trees.trees.find((t) => t.entity.name === "DrParent");
		expect(drParent).toBeFalsy();
		const drSib = trees.trees.find((t) => t.entity.name === "DrSib");
		expect(drSib).toBeTruthy();
		expect(drSib.children.map((c) => c.entity.name)).toContain("DrLeaf");
	});
});

// BUG C: the report used to dump every extract fact (tens of thousands) into
// "Shared-entity candidates". It must cap the list and note how many were omitted.
describe("BUG C: shared-entity section is capped", () => {
	it("caps the shared-entity candidates and notes the omitted count", () => {
		const extracts = Array.from({ length: 200 }, (_, i) => ({
			left: { name: `L${i}`, sourceFile: `a.ts`, line: 1 },
			right: { name: `R${i}`, sourceFile: `b.ts`, line: 1 },
			shared: ["x"],
			suggest: "extract a shared type for x",
		}));
		const md = renderEntityReport({ files: 1, entityCount: 0, matches: [], clusters: [], suggestions: [], trees: { trees: [], extracts } });

		const bullets = md.split("\n").filter((l) => l.startsWith("- **L"));
		expect(bullets.length).toBeLessThan(200);
		expect(md).toMatch(/more/i);
	});
});

// BUG E: the extract path scored a pair by raw overlap (inter/min), which
// saturates to 1.00 for ANY two shapes with identical filtered name sets —
// even a tiny two-field shape sharing its whole body. The properties matcher
// already applies small/tiny-shape discounts against exactly this saturation;
// the extract path must agree, so a tiny full-overlap pair stays below 1.00.
describe("BUG E: extract score does not saturate to 1.00 on tiny shapes", () => {
	it("scores a tiny identical two-field intersection below 1.0", () => {
		const config = buildConfig(["tests/duplicates/tiny"]);
		const { facts } = runStages(config);

		const ext = facts.find((f) => f.type === "extract" && [f.left.name, f.right.name].sort().join("|") === "TerminalDimensions|TerminalSize");
		expect(ext).toBeTruthy();
		expect(ext.shared).toEqual(expect.arrayContaining(["columns", "rows"]));
		expect(ext.score).toBeGreaterThan(0);
		expect(ext.score).toBeLessThan(1);
	});
});

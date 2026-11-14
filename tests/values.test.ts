import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../dist/normalizer/index.js");
const { normalizeEntities } = require("../dist/frameworks/entrypoint.js");
const { matchSignals } = require("../dist/matcher/index.js");
const { decide } = require("../dist/decision-maker.js");
const main = require("../dist/main.js");

const pluginDir = path.resolve(__dirname, "..");

const load = (rel) => {
	const ctx = normalizer.parseAndExtract(path.join(pluginDir, "tests", rel));
	return normalizeEntities(ctx.entities, ctx);
};

const find = (entities, name) => {
	const e = entities.find((x) => x.name === name);
	expect(e, `entity ${name} should be extracted`).toBeTruthy();

	return e;
};

describe("value trees are captured by the normalizer", () => {
	const entities = load("duplicates/values/renamed-copy.ts");
	const a = find(entities, "THEME_LIGHT");

	it("records the initializer as a deep value tree", () => {
		expect(a.valueTree).toBeTruthy();
		expect(a.valueTree.kind).toBe("object");
		expect(a.valueTree.entries.name).toEqual({ kind: "primitive", value: "s:light" });
		expect(a.valueTree.entries.radius).toEqual({ kind: "primitive", value: "n:6" });
		expect(a.valueTree.entries.dark).toEqual({ kind: "primitive", value: "b:false" });
		expect(a.valueTree.entries.spacing.kind).toBe("array");
		expect(a.valueTree.entries.colors.kind).toBe("object");
		expect(a.valueTree.entries.colors.entries.accent).toEqual({ kind: "primitive", value: "s:#0066cc" });
	});
});

describe("renamed copies with identical values are duplicates", () => {
	const entities = load("duplicates/values/renamed-copy.ts");
	const a = find(entities, "THEME_LIGHT");
	const b = find(entities, "DAY_PALETTE");

	it("scores the values signal as a full tree match", () => {
		const v = matchSignals(a, b, {}).values;
		expect(v.hasEvidence).toBe(true);
		expect(v.evidence.form).toBe("tree");
		expect(v.evidence.identical).toBe(true);
		expect(v.score).toBe(1);
	});

	it("decides the pair as a duplicate under different names", () => {
		const signals = matchSignals(a, b, {});
		const decision = decide(a, b, { signals });
		expect(decision.isDuplicate).toBe(true);
		expect(decision.tier).toBe("duplicate");
		expect(decision.reason).toMatch(/renamed copy/);
	});

	it("the full pipeline flags the renamed copy", () => {
		const config = main.buildConfig(pluginDir, null, { roots: ["tests/duplicates/values"], thresholds: null, weights: null, verbose: false, out: null, requireExported: false, include: null });
		const result = main.run(config);
		const pair = result.matches.find((m) => [m.a.name, m.b.name].sort().join("|") === "DAY_PALETTE|THEME_LIGHT");
		expect(pair).toBeTruthy();
		expect(pair.tier).toBe("duplicate");
	});
});

describe("same shape but different values are NOT duplicates", () => {
	const entities = load("NOT_duplicates/values/different-values.ts");
	const a = find(entities, "LIMITS_A");
	const b = find(entities, "LIMITS_B");

	it("the values signal sees the disagreement", () => {
		const v = matchSignals(a, b, {}).values;
		expect(v.hasEvidence).toBe(true);
		expect(v.evidence.identical).toBe(false);
		expect(v.score).toBeLessThan(1);
	});

	it("does not decide the pair as a duplicate", () => {
		const signals = matchSignals(a, b, {});
		const decision = decide(a, b, { signals });
		expect(decision.isDuplicate).toBe(false);
		expect(decision.reason).not.toMatch(/renamed copy/);
	});
});

describe("functions are not compared by value", () => {
	const entities = load("NOT_duplicates/values/functions.ts");
	const a = find(entities, "HANDLER_A");
	const b = find(entities, "HANDLER_B");

	it("does not treat function markers as a renamed-copy duplicate", () => {
		const signals = matchSignals(a, b, {});
		const decision = decide(a, b, { signals });
		expect(decision.reason).not.toMatch(/renamed copy/);
		expect(decision.isDuplicate).toBe(false);
	});
});

describe("value-tree comparison semantics", () => {
	const { score } = require("../dist/matcher/values.js");
	const prim = (value) => ({ kind: "primitive", value });
	const obj = (entries) => ({ kind: "object", entries });
	const arr = (items) => ({ kind: "array", items });

	it("object key order does not matter", () => {
		const a = { valueTree: obj({ x: prim("n:1"), y: prim("n:2"), z: prim("n:3") }) };
		const b = { valueTree: obj({ z: prim("n:3"), y: prim("n:2"), x: prim("n:1") }) };
		expect(score(a, b).evidence.identical).toBe(true);
	});

	it("array order matters", () => {
		const a = { valueTree: arr([prim("n:1"), prim("n:2"), prim("n:3")]) };
		const b = { valueTree: arr([prim("n:3"), prim("n:2"), prim("n:1")]) };
		expect(score(a, b).evidence.identical).toBe(false);
	});

	it("a missing key lowers the score", () => {
		const a = { valueTree: obj({ x: prim("n:1"), y: prim("n:2"), z: prim("n:3") }) };
		const b = { valueTree: obj({ x: prim("n:1"), y: prim("n:2") }) };
		const s = score(a, b);
		expect(s.evidence.identical).toBe(false);
		expect(s.score).toBeLessThan(1);
		expect(s.score).toBeGreaterThan(0);
	});

	it("a lone scalar is not discriminating evidence", () => {
		const a = { valueTree: prim("n:1") };
		const b = { valueTree: prim("n:1") };
		expect(score(a, b).hasEvidence).toBe(false);
	});
});
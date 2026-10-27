import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");
const { matchSignals } = require("../matcher/index.js");
const { decide } = require("../decision-maker.js");
const { weights, thresholds } = require("../tuning.js");

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

describe("byte-identical object literals in the same file are duplicates", () => {
	const entities = load("duplicates/identical-objects/identical-objects.ts");
	const a = find(entities, "stylingA");
	const b = find(entities, "stylingB");

	it("extracts the object literals with their properties", () => {
		expect(a.properties.map((p) => p.name).sort()).toEqual([
			"after",
			"dark",
			"light",
			"rangeBehavior",
		]);
		expect(b.properties.map((p) => p.name).sort()).toEqual([
			"after",
			"dark",
			"light",
			"rangeBehavior",
		]);
	});

	it("scores the properties signal as full agreement (1.0)", () => {
		const { score, evidence } = matchSignals(a, b, {}).properties;
		// Both shapes are 100% identical: every property name, order and type
		// matches. The generic-type discount must NOT cap a true copy-paste at
		// 0.7 — that is what made the user's styling/styling2 pair report 0.66.
		expect(evidence.jaccard).toBe(1);
		expect(evidence.overlap).toBe(1);
		expect(evidence.typeAgreement).toBe(1);
		expect(score).toBeGreaterThanOrEqual(0.99);
	});

	it("decides the pair as a duplicate (confidence >= 0.85)", () => {
		const signals = matchSignals(a, b, {});
		const decision = decide(a, b, { signals, weights, thresholds });
		expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
		expect(decision.tier).toBe("duplicate");
	});
});

describe("byte-identical object literals in DIFFERENT files are duplicates", () => {
	// The user's real case: `styling` in decorations.ts vs `styling2` in
	// host-decorations.ts. Two files, identical 4-field shapes with placeholder
	// types. The generic-shape discount used to apply here and capped the pair
	// at properties 0.70 / confidence 0.66.
	const fileA = load("duplicates/identical-objects/identical-objects-a.ts");
	const fileB = load("duplicates/identical-objects/identical-objects-b.ts");
	const a = find(fileA, "stylingA");
	const b = find(fileB, "stylingB");

	it("scores the properties signal as full agreement (1.0) across files", () => {
		const { score, evidence } = matchSignals(a, b, {}).properties;
		expect(evidence.jaccard).toBe(1);
		expect(evidence.overlap).toBe(1);
		expect(evidence.typeAgreement).toBe(1);
		expect(score).toBeGreaterThanOrEqual(0.99);
	});

	it("decides the cross-file pair as a duplicate (confidence >= 0.85)", () => {
		const signals = matchSignals(a, b, {});
		const decision = decide(a, b, { signals, weights, thresholds });
		expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
		expect(decision.tier).toBe("duplicate");
	});
});

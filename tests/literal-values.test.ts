import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");
const { matchSignals } = require("../matcher/index.js");

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

describe("literal-union types must preserve their values, not collapse to a bare token", () => {
	const kindA = find(load("duplicates/literal/kind-a.ts"), "KindA");
	const kindB = find(load("NOT_duplicates/literal/kind-b.ts"), "KindB");
	const kindC = find(load("duplicates/literal/kind-c.ts"), "KindC");

	it("captures the literal values in the canonical type (not a bare 'literal')", () => {
		const typeA = kindA.properties.find((p) => p.name === "kind").type;
		// The bug: every LiteralType collapsed to the single token "literal", so
		// two unions with DISJOINT values compared equal. The canonical type must
		// carry the actual values instead.
		expect(typeA).not.toBe("literal");
		expect(typeA).toContain("comment");
		expect(typeA).toContain("event");
	});

	it("treats disjoint literal values as a type DISagreement", () => {
		const typeA = kindA.properties.find((p) => p.name === "kind").type;
		const typeB = kindB.properties.find((p) => p.name === "kind").type;
		// "comment"|"event" vs "human"|"bot" — no shared value, so the canonical
		// types must differ.
		expect(typeA).not.toBe(typeB);
	});

	it("scores disjoint-literal pairs LOWER than identical-literal pairs", () => {
		const disjoint = matchSignals(kindA, kindB, {}).properties.score;
		const identical = matchSignals(kindA, kindC, {}).properties.score;
		// Same names on both sides, but A↔B disagree on the `kind` values while
		// A↔C agree — the properties signal must reflect that.
		expect(disjoint).toBeLessThan(identical);
	});

	it("still scores identical literal unions as full agreement", () => {
		const identical = matchSignals(kindA, kindC, {}).properties.score;
		// A and C are byte-identical in type — nothing should discount them.
		expect(identical).toBeGreaterThan(0.9);
	});
});

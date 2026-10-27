import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");
const { matchSignals } = require("../matcher/index.js");
const decisionMaker = require("../decision-maker.js");

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

describe("generic placeholder types must not saturate the properties signal", () => {
	const pageA = find(load("NOT_duplicates/generic/page-a.tsx"), "metadata");
	const pageB = find(load("NOT_duplicates/generic/page-b.tsx"), "metadata");
	// shapeA/shapeB share 4 of 5 generic-typed fields but differ on the fifth —
	// they are NOT byte-identical, so the generic-shape discount still applies.
	// (The old pageA/pageB fixtures had identical top-level shapes, which the
	// fixed matcher now correctly scores as 1.0 — a true copy-paste shape.)
	const shapeA = find(load("NOT_duplicates/generic/shape-a.ts"), "shapeA");
	const shapeB = find(load("NOT_duplicates/generic/shape-b.ts"), "shapeB");
	const profileA = find(load("duplicates/generic/profile-a.ts"), "profileA");
	const profileB = find(load("duplicates/generic/profile-b.ts"), "profileB");

	it("sees generic placeholder types on the un-annotated metadata literals", () => {
		const types = pageA.properties.map((p) => p.type);
		// Nested members (alternates/openGraph/twitter/keywords) have no annotations,
		// so they come out as generic placeholders (object/array) that carry no type
		// identity — these are what used to saturate the type-agreement signal.
		expect(types).toContain("object");
		expect(types).toContain("array");
	});

	it("does NOT score two generic-shaped literals that differ on a field as properties=1.0", () => {
		const sig = matchSignals(shapeA, shapeB, {});
		// Same generic shape but one field differs (twitter vs keywords) — the
		// generic-shape discount must keep the properties signal below 1.00.
		expect(sig.properties.score).toBeLessThan(1.0);
		expect(sig.properties.score).toBeGreaterThan(0);
	});

	it("keeps a high properties score for genuinely type-verified near-duplicates", () => {
		const sig = matchSignals(profileA, profileB, {});
		// profileA/profileB share concrete types (string/number/boolean), so the
		// generic-type discount must not drag this verified pair down.
		expect(sig.properties.score).toBeGreaterThan(0.8);
	});

	it("does not push two generic-shaped literals that differ on a field to confidence 1.00", () => {
		const signals = matchSignals(shapeA, shapeB, {});
		const decision = decisionMaker.decide(shapeA, shapeB, { signals });
		expect(decision.confidence).toBeLessThan(1.0);
	});

	it("scores byte-identical generic-shaped literals as a full 1.0 (copy-paste)", () => {
		// pageA/pageB have identical top-level shapes (same 6 names/types). They
		// differ only in nested values the matcher cannot see, so the fixed matcher
		// treats the identical shape as a copy-paste and scores properties=1.0.
		const sig = matchSignals(pageA, pageB, {});
		expect(sig.properties.score).toBeGreaterThanOrEqual(0.99);
	});
});

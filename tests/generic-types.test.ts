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

	it("does NOT score two unrelated generic-shaped literals as properties=1.0", () => {
		const sig = matchSignals(pageA, pageB, {});
		// Same shape, same names, but types are unverified placeholders — the
		// properties signal must be discounted below the saturated 1.00.
		expect(sig.properties.score).toBeLessThan(1.0);
		expect(sig.properties.score).toBeGreaterThan(0);
	});

	it("keeps a high properties score for genuinely type-verified near-duplicates", () => {
		const sig = matchSignals(profileA, profileB, {});
		// profileA/profileB share concrete types (string/number/boolean), so the
		// generic-type discount must not drag this verified pair down.
		expect(sig.properties.score).toBeGreaterThan(0.8);
	});

	it("does not push two generic-shaped literals to confidence 1.00", () => {
		const signals = matchSignals(pageA, pageB, {});
		const decision = decisionMaker.decide(pageA, pageB, { signals });
		expect(decision.confidence).toBeLessThan(1.0);
	});
});

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { signature } = require("../matcher/index.js");
const decisionMaker = require("../decision-maker.js");
const { matchSignals } = require("../matcher/index.js");

// Build a synthetic entity with the shape the matchers consume.
const ent = (name, methods, props = []) => ({
	name,
	kind: "interface",
	properties: props.map((n) => ({ name: n, type: "value" })),
	methods: methods.map((n) => ({ name: n, params: [], returnType: "void" })),
});

describe("signature must not saturate to 1.0 on a single shared method", () => {
	it("scores a single shared method below the saturated 1.0", () => {
		// SettingsService (8 methods) vs DisposableLike (1 method) share only the
		// trivial `dispose`. One shared method is a weak "same signature" estimate —
		// the ratio is binary (0 or 1) and reads as a perfect 1.00 even when the
		// entities are otherwise unrelated.
		const a = ent("SettingsService", ["getAllowList", "getSettings", "getUserSettings", "getUserFeatures", "getUserSettingsConfig", "updateUserSettings", "isTaskSyncEnabled", "dispose"]);
		const b = ent("DisposableLike", ["dispose"]);
		const sig = signature.score(a, b);
		expect(sig.hasEvidence).toBe(true);
		expect(sig.score).toBeLessThan(1.0);
		expect(sig.score).toBeGreaterThan(0);
	});

	it("still scores a genuine multi-method signature agreement near 1.0", () => {
		// Two entities sharing several identically-signed methods is a strong, real
		// signature match — the discount must not drag it down.
		const a = ent("A", ["save", "load", "reset", "dispose"]);
		const b = ent("B", ["save", "load", "reset", "dispose"]);
		const sig = signature.score(a, b);
		expect(sig.score).toBeGreaterThan(0.9);
	});

	it("does not let a single trivial method push a pair to the extract tier", () => {
		// The real-world pair: SettingsService <-> DisposableLike. With the
		// saturated signature (1.0) this lands in extract at ~0.597; with the
		// discount it must fall back to similar.
		const a = ent("SettingsService", ["getAllowList", "getSettings", "getUserSettings", "getUserFeatures", "getUserSettingsConfig", "updateUserSettings", "isTaskSyncEnabled", "dispose"]);
		const b = ent("DisposableLike", ["dispose"]);
		const signals = matchSignals(a, b, {});
		const decision = decisionMaker.decide(a, b, { signals });
		expect(decision.tier).not.toBe("extract");
		expect(decision.tier).not.toBe("duplicate");
	});
});

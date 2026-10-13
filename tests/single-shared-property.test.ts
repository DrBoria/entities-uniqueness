import { describe, expect, it } from "vitest";
import { matchSignals } from "../matcher/index.js";
import { decide, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from "../decision-maker.js";

// Two unrelated seed fixtures sharing only a generic {id, name} shape. With
// `id` in ignoredMembers, the only shared property name is `name` — a single
// shared name is not enough evidence to call the shapes similar.
const opts = { ignoredMembers: ["id", "createdAt", "updatedAt", "resourceType"] };
const chen = { name: "CHEN", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }] };
const quest = { name: "QUEST", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }] };

const decidePair = (a: typeof chen, b: typeof chen) => {
	const signals = matchSignals(a, b, opts);
	return decide(a, b, { signals, weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS });
};

describe("single shared property is weak evidence", () => {
	it("does not score two {id, name} fixtures as extract candidates", () => {
		const d = decidePair(chen, quest);

		expect(d.confidence).toBeLessThan(DEFAULT_THRESHOLDS.extract);
		expect(d.tier).not.toBe("extract");
		expect(d.tier).not.toBe("duplicate");
	});

	it("keeps the properties signal weak when only one name is shared", () => {
		const signals = matchSignals(chen, quest, opts);

		expect(signals.properties.evidence.inter).toBe(1);
		expect(signals.properties.score).toBeLessThan(0.5);
	});

	it("keeps full strength when two or more names are shared", () => {
		const a = { name: "A", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }, { name: "email", type: "string" }] };
		const b = { name: "B", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }, { name: "email", type: "string" }] };
		const signals = matchSignals(a, b, opts);

		expect(signals.properties.evidence.inter).toBe(2);
		// Two genuinely shared, type-verified properties must stay a strong signal.
		expect(signals.properties.score).toBeGreaterThan(0.8);
	});
});

// The real pipeline defaults `ignoredMembers` to [] (main.js), so two unrelated
// {id, name} reference shapes share BOTH names (inter=2, union=2) and ride the
// mild small-shape discount all the way to ~0.93 → confidence ~0.80. A shape
// whose ENTIRE body is two fields is the most common shape in any codebase and
// is not discriminating evidence, so it must land far below the extract tier.
describe("two-field reference shapes are weak evidence (no ignoredMembers)", () => {
	const emptyOpts = { ignoredMembers: [] };
	const lab = { name: "transportLabSchema", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }] };
	const seed = { name: "SEED_CUSTOMER", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }] };

	it("keeps the properties signal weak when the whole shape is two fields", () => {
		const signals = matchSignals(lab, seed, emptyOpts);

		expect(signals.properties.evidence.inter).toBe(2);
		expect(signals.properties.evidence.union).toBe(2);
		expect(signals.properties.score).toBeLessThan(0.5);
	});

	it("does not score two {id, name} shapes as extract or duplicate candidates", () => {
		const signals = matchSignals(lab, seed, emptyOpts);
		const d = decide(lab, seed, { signals, weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS });

		expect(d.confidence).toBeLessThan(DEFAULT_THRESHOLDS.extract);
		expect(d.tier).not.toBe("extract");
		expect(d.tier).not.toBe("duplicate");
	});

	it("keeps a genuine three-field shape at full strength even with nothing ignored", () => {
		const a = { name: "A", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }, { name: "email", type: "string" }] };
		const b = { name: "B", properties: [{ name: "id", type: "string" }, { name: "name", type: "string" }, { name: "email", type: "string" }] };
		const signals = matchSignals(a, b, emptyOpts);

		expect(signals.properties.evidence.inter).toBe(3);
		expect(signals.properties.score).toBeGreaterThan(0.8);
	});
});

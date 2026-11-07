import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { parseAndExtract } = require("../normalizer/index.js");
const { decide } = require("../decision-maker.js");
const { matchSignals } = require("../matcher/index.js");

const FIXTURE = path.resolve(__dirname, "entities-enums/shapes.ts");

const entities = () => parseAndExtract(FIXTURE).entities;
const byName = (name) => entities().find((e) => e.name === name);

describe("enum entities", () => {
	it("an enum is an entity of its own, with its members as properties", () => {
		const payment = byName("PaymentStatus");

		expect(payment.kind).toBe("enum");
		expect(payment.properties).toEqual([
			{ name: "Pending", type: '"pending"' },
			{ name: "Paid", type: '"paid"' },
		]);
		expect(payment.exported).toBe(true);
	});

	it("two enums with the same members carry the same shape", () => {
		const a = byName("PaymentStatus");
		const b = byName("InvoiceStatus");

		expect(b.properties).toEqual(a.properties);
		expect(b.complexity).toBe(a.complexity);
	});
});

describe("generic entities — a type parameter is a hole, not a name", () => {
	it("`Box<T>` and `Crate<U>` canonicalize their members to the same type", () => {
		const box = byName("Box");
		const crate = byName("Crate");

		expect(box.properties).toEqual([{ name: "value", type: "§" }]);
		expect(crate.properties).toEqual(box.properties);
		expect(crate.methods).toEqual(box.methods);
	});

	it("a concrete type argument is NOT a hole", () => {
		const extracted = parseAndExtract(FIXTURE).entities;
		const plain = extracted.find((e) => e.name === "PaymentStatus");

		expect(plain.properties.map((p) => p.type)).not.toContain("§");
	});
});

describe("cross-entity: an enum and a literal union are one shape", () => {
	it("a type made of the same literals carries the same value set", () => {
		const state = byName("PaymentState");

		expect(state.values).toEqual(["pending", "paid"]);
		expect(state.values).toEqual(byName("PaymentStatus").values);
	});

	it("they are decided as duplicates, without a name-based signal", () => {
		const payment = byName("PaymentStatus");
		const state = byName("PaymentState");
		const verdict = decide(payment, state, { signals: matchSignals(payment, state) });

		expect(verdict.isDuplicate).toBe(true);
		expect(verdict.reason).toMatch(/same value set/);
	});

	it("a different set of values is NOT the same shape", () => {
		const payment = byName("PaymentStatus");
		const crate = byName("Crate");

		expect(decide(payment, crate, { signals: matchSignals(payment, crate) }).reason).not.toMatch(/same value set/);
	});
});

describe("declarations that carry more than their shape", () => {
	it("a decorated class records the decorator by name", () => {
		const widget = byName("Widget");

		expect(widget.decorators).toEqual(["Component"]);
	});

	it("fields say whether they are static, readonly or private", () => {
		const byField = Object.fromEntries(byName("Widget").properties.map((p) => [p.name, p]));

		expect(byField.count.static).toBe(true);
		expect(byField.id.readonly).toBe(true);
		expect(byField["#secret"].private).toBe(true);
		expect(byField.value.static).toBeUndefined();
	});

	it("`as const` is recorded, and the literal is still an entity", () => {
		expect(byName("config")).toMatchObject({ assertion: "as", constValue: true });
		expect(byName("config").properties.map((p) => p.name)).toEqual(["retries"]);
	});

	it("`satisfies X` names the shape, so the literal is an instance — not a copy", () => {
		expect(byName("settings")).toBeUndefined();
		expect(byName("Settings")).toBeTruthy();
	});
});

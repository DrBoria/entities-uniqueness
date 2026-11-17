import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const base = path.resolve(__dirname, "..", "dist");
const normalizer = require(path.join(base, "normalizer/index.js"));
const { normalizeEntities } = require(path.join(base, "frameworks/entrypoint.js"));
const { matchSignals, signature } = require(path.join(base, "matcher/index.js"));
const { decide } = require(path.join(base, "decision-maker.js"));

const loadDir = (dir) => {
	const all = [];
	for (const f of fs.readdirSync(dir)) {
		const ctx = normalizer.parseAndExtract(path.join(dir, f));
		all.push(...normalizeEntities(ctx.entities, ctx));
	}

	return all;
};

// Synthetic entities with explicit parameter TYPES (the shape the matcher reads).
const ent = (name, methods) => ({
	name,
	kind: "class",
	properties: [],
	methods: methods.map((m) => ({ name: m.name, params: m.params ?? [], paramTypes: m.paramTypes ?? [], returnType: m.returnType ?? "void" })),
});

describe("signature compares parameter TYPES, not parameter names", () => {
	it("f(id: string) ≡ f(ticketId: string) — names differ, types agree", () => {
		const a = ent("A", [{ name: "fetch", params: ["id"], paramTypes: ["string"], returnType: "Promise<string>" }]);
		const b = ent("B", [{ name: "fetch", params: ["ticketId"], paramTypes: ["string"], returnType: "Promise<string>" }]);
		const s = signature.score(a, b);
		expect(s.evidence.matching).toBe(1);
		expect(s.score).toBeGreaterThan(0);
	});

	it("f(id: string) ≠ f(id: number) — same name, different type", () => {
		const a = ent("A", [{ name: "fetch", params: ["id"], paramTypes: ["string"], returnType: "void" }]);
		const b = ent("B", [{ name: "fetch", params: ["id"], paramTypes: ["number"], returnType: "void" }]);
		expect(signature.score(a, b).evidence.matching).toBe(0);
	});

	it("optionality is a modifier: string ≡ string? in a parameter", () => {
		const a = ent("A", [{ name: "f", params: ["x"], paramTypes: ["string"], returnType: "void" }]);
		const b = ent("B", [{ name: "f", params: ["x"], paramTypes: ["string?"], returnType: "void" }]);
		expect(signature.score(a, b).evidence.matching).toBe(1);
	});
});

describe("signature follows the methods pairing — a rename is still compared", () => {
	it("fetchTirket ↔ fetchTicket with identical types scores a full signature match", () => {
		const a = ent("A", [{ name: "fetchTirket", params: ["ticketId"], paramTypes: ["string"], returnType: "Promise<string>" }]);
		const b = ent("B", [{ name: "fetchTicket", params: ["ticketId"], paramTypes: ["string"], returnType: "Promise<string>" }]);
		const s = signature.score(a, b);
		expect(s.evidence.shared).toBe(1);
		expect(s.evidence.matching).toBe(1);
	});

	it("e09: 8 one-letter-renamed methods with identical signatures → signature 100%, verdict duplicate", () => {
		const all = loadDir(path.resolve(__dirname, "..", "..", "adversarial", "entities", "src", "e09"));
		const a = all.find((e) => e.name === "TicketFacade");
		const b = all.find((e) => e.name === "TicketService");
		const s = matchSignals(a, b, { entities: all });
		expect(s.signature.evidence.shared).toBe(8);
		expect(s.signature.evidence.matching).toBe(8);
		expect(s.signature.score).toBe(1);
		const d = decide(a, b, { signals: s });
		expect(d.tier).toBe("duplicate");
	});

	it("a renamed method whose TYPES differ is shared but not matching", () => {
		const a = ent("A", [{ name: "fetchTirket", params: ["id"], paramTypes: ["string"], returnType: "Promise<string>" }]);
		const b = ent("B", [{ name: "fetchTicket", params: ["id"], paramTypes: ["number"], returnType: "Promise<string>" }]);
		const s = signature.score(a, b);
		expect(s.evidence.shared).toBe(1);
		expect(s.evidence.matching).toBe(0);
	});
});

describe("e14: same property names, every type different — properties grades it, not a duplicate", () => {
	const all = loadDir(path.resolve(__dirname, "..", "..", "adversarial", "entities", "src", "e14"));
	const a = all.find((e) => e.name === "SensorCalibration");
	const b = all.find((e) => e.name === "SensorSample");

	it("all 8 names shared, zero types agree → properties 50% (name overlap discounted by type)", () => {
		const s = matchSignals(a, b, { entities: all });
		expect(s.properties.evidence.inter).toBe(8);
		expect(s.properties.evidence.typeAgreement).toBe(0);
		expect(s.properties.score).toBeCloseTo(0.5, 2);
	});

	it("sensorId/temperature are shared NAMES with differing types — a partial correspondence, not a duplicate", () => {
		const s = matchSignals(a, b, { entities: all });
		const d = decide(a, b, { signals: s });
		expect(d.tier).toBe("similar");
		expect(d.isDuplicate).toBe(false);
	});

	it("no methods → signature carries no evidence (it cannot call these duplicates)", () => {
		const s = matchSignals(a, b, { entities: all });
		expect(s.signature.hasEvidence).toBe(false);
	});
});

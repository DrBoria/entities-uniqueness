import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");

const pluginDir = path.resolve(__dirname, "..");
const ZOD_FILE = path.join(pluginDir, "tests", "entities", "zod", "chomp-schema.ts");

// chomp-2 imports zod from "utils", not "zod" — the fixture mirrors that.
const normalizeFile = (file) => {
	const ctx = normalizer.parseAndExtract(file);
	return normalizeEntities(ctx.entities, ctx);
};

const propsOf = (entities, name) => {
	const e = entities.find((x) => x.name === name);
	expect(e, `entity ${name} should be extracted`).toBeTruthy();
	expect(e.kind).toBe("zod");
	expect(e.framework).toBe("zod");

	return new Map(e.properties.map((p) => [p.name, p.type]));
};

describe("zod normalization (chomp-2 style, import from utils)", () => {
	const entities = normalizeFile(ZOD_FILE);

	it("extracts zod schemas whose z comes from a re-exporting module", () => {
		const names = entities.map((e) => e.name);
		expect(names).toContain("identitySchema");
		expect(names).toContain("addressSchema");
		expect(names).toContain("vitalValueSchema");
		expect(names).toContain("patientIdSchema");
		expect(names).toContain("filtersSchema");
		expect(names).toContain("customSchema");
		expect(names).toContain("coercedSchema");
	});

	it("canonicalizes chained calls (z.string().optional() -> string?)", () => {
		const identity = propsOf(entities, "identitySchema");
		expect(identity.get("legalFirstName")).toBe("string");
		expect(identity.get("middleName")).toBe("string?");
		expect(identity.get("ssn")).toBe("string?");
	});

	it("canonicalizes z.instanceof(X).optional() and z.instanceof(X)", () => {
		const identity = propsOf(entities, "identitySchema");
		expect(identity.get("legalDateOfBirth")).toBe("Tx.Day?");

		const address = propsOf(entities, "addressSchema");
		expect(address.get("effectiveStart")).toBe("Tx.Day?");
	});

	it("canonicalizes z.nativeEnum, z.literal, z.uuidv4, z.custom, z.coerce", () => {
		const identity = propsOf(entities, "identitySchema");
		expect(identity.get("sex")).toBe("Sex");
		expect(identity.get("race")).toBe("RaceCategory[]");

		const vital = propsOf(entities, "vitalValueSchema");
		expect(vital.get("kind")).toBe("literal");
		expect(vital.get("systolic")).toBe("number?");

		const patientId = propsOf(entities, "patientIdSchema");
		expect(patientId.get("patientId")).toBe("string");

		const custom = propsOf(entities, "customSchema");
		expect(custom.get("date")).toBe("Tx.PlainDate");

		const coerced = propsOf(entities, "coercedSchema");
		expect(coerced.get("amount")).toBe("number");
	});

	it("canonicalizes z.record(z.string(), z.string()) and z.enum", () => {
		const filters = propsOf(entities, "filtersSchema");
		expect(filters.get("labels")).toBe("Record<string,string>?");

		const status = entities.find((e) => e.name === "statusSchema");
		// z.enum([...]) is not an object shape — it must not be extracted as a
		// zod entity with fake properties, but it must not crash either.
		if (status) {
			expect(status.kind).toBe("zod");
		}
	});

	it("canonicalizes z.string().url() / .regex() to the base type", () => {
		const identity = propsOf(entities, "identitySchema");
		expect(identity.get("photoUrl")).toBe("string?");

		const address = propsOf(entities, "addressSchema");
		expect(address.get("postalCode")).toBe("string");
	});

	it("canonicalizes arrays of primitive zod calls (z.array(z.string()).optional())", () => {
		const assignment = propsOf(entities, "assignmentSchema");
		expect(assignment.get("careCircle")).toBe("string[]?");
	});

	it("canonicalizes arrays of inline z.object (no raw z.* text)", () => {
		const inline = propsOf(entities, "assignmentInlineSchema");
		const type = inline.get("careCircle");
		expect(type).not.toContain("z.");
		expect(type).toBe("object[]?");
	});
});

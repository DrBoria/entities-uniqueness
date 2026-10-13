import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");
const { normalizeEntities } = require("../frameworks/entrypoint.js");

const pluginDir = path.resolve(__dirname, "..");
const MOBX_FILE = path.join(pluginDir, "tests", "entities", "mobx", "jabber-store.ts");

// Mirrors Jabberwock's mobx stores: makeAutoObservable object literals, both
// inside a factory function (createCLIStore) and top-level (topStore).
const normalizeFile = (file) => {
	const ctx = normalizer.parseAndExtract(file);
	return { ctx, entities: normalizeEntities(ctx.entities, ctx) };
};

const propsOf = (entities, name) => {
	const e = entities.find((x) => x.name === name);
	expect(e, `entity ${name} should be extracted`).toBeTruthy();

	return new Map(e.properties.map((p) => [p.name, p.type]));
};

describe("mobx store extraction (Jabberwock style)", () => {
	const { ctx, entities } = normalizeFile(MOBX_FILE);

	it("extracts a makeAutoObservable store created inside a function (named by its variable)", () => {
		const e = entities.find((x) => x.name === "store");
		expect(e, "store should be extracted").toBeTruthy();
		expect(e.kind).toBe("object");
		expect(e.framework).toBe("mobx");
	});

	it("extracts a top-level makeAutoObservable store", () => {
		const e = entities.find((x) => x.name === "topStore");
		expect(e, "topStore should be extracted").toBeTruthy();
		expect(e.kind).toBe("object");
		expect(e.framework).toBe("mobx");
	});

	it("preserves `as`-asserted field types instead of dropping them to generic", () => {
		const props = propsOf(entities, "store");
		expect(props.get("messages")).toBe("string[]");
		expect(props.get("taskHistory")).toBe("number[]");
		expect(props.get("pendingAsk")).toBe("string?");
	});

	it("infers plain literal field types", () => {
		const props = propsOf(entities, "store");
		expect(props.get("isLoading")).toBe("boolean");
		expect(props.get("isComplete")).toBe("boolean");
	});
});

describe("import collection (TS 5.9 namedBindings)", () => {
	it("collects named import specifiers so uses/imports are not empty", () => {
		const { ctx } = normalizeFile(MOBX_FILE);
		expect([...ctx.imports]).toContain("makeAutoObservable");
	});
});

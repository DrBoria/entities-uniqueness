import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");

const pluginDir = path.resolve(__dirname, "..");
const TSX_FILE = path.join(pluginDir, "tests", "entities", "tsx", "panel.tsx");

describe("tsx parsing", () => {
	it("does not fabricate entities from JSX in .tsx files", () => {
		const entities = normalizer.extractFromFile(TSX_FILE);

		// The arrow components are not object/factory shapes, so the only real
		// entity is the PANEL_VARIANTS object literal. The bug made the parser
		// read `<div .../>` as an object literal and fabricate "className" objects.
		const names = entities.map((e) => e.name).sort();
		expect(names).toEqual(["PANEL_VARIANTS"]);

		for (const e of entities) {
			expect(e.name).not.toBe("className");
		}
	});
});

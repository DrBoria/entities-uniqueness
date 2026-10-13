import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const normalizer = require("../normalizer/index.js");

const pluginDir = path.resolve(__dirname, "..");
const E2E_FILE = path.join(pluginDir, "tests", "Trash", "e2e", "widget.e2e.ts");

describe("e2e test files", () => {
	it("excludes *.e2e.ts specs like other test files", () => {
		const entities = normalizer.extractFromFile(E2E_FILE);

		// e2e specs are test scaffolding (Playwright), not production code —
		// their local helpers must not be cataloged as entities.
		expect(entities).toHaveLength(0);
	});
});

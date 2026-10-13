import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const main = require("../main.js");
const pluginDir = path.resolve(__dirname, "..");

describe("ignore dirs", () => {
it("ignores generated storybook-static output by default", () => {
const config = main.buildConfig(pluginDir, null, { roots: ["tests/entities"], thresholds: null, weights: null, verbose: false, out: null, requireExported: false, include: null });

expect(config.ignoreDirs).toContain("storybook-static");
});
});

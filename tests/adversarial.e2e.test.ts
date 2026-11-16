import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const main = require("../dist/main.js");

// ── ADVERSARIAL E2E ─────────────────────────────────────────────────────────
// Runs the real pipeline against the adversarial/entities fixture (18 hard
// traps written by a competing "trap author" agent) and scores every trap the
// same way adversarial/run.cjs does. This locks the detector's ground truth so
// a future engine change cannot silently drop a caught trap or start flagging a
// legitimate look-alike. The fixture lives OUTSIDE this package; if it is absent
// the suite is skipped (the engine still ships and tests on its own).
//
// Known, documented gaps are asserted as MISS (not silently passed). As of the
// optional/nullable + object-shape inference fixes, e04/e06 are caught as
// duplicates, so the floor is the full 18/18. e13 is correctly dropped. No trap
// may FAIL (a false duplicate on an expect:none).

const pluginDir = path.resolve(__dirname, "..");
const fixtureDir = path.resolve(pluginDir, "../adversarial/entities");
const manifestPath = path.join(fixtureDir, "manifest.json");

const fs = require("node:fs") as typeof import("node:fs");
const hasFixture = fs.existsSync(manifestPath);

const pairKey = (a: string, b: string) => [a, b].sort().join("::");

// The harness verdict rules (adversarial/run.cjs), verbatim.
const verdict = (expect: string, tiers: string[]): "PASS" | "MISS" | "FAIL" => {
	if (expect === "none") return tiers.includes("duplicate") ? "FAIL" : "PASS";
	if (expect === "similar") return tiers.some((t) => ["similar", "extract", "duplicate"].includes(t)) ? "PASS" : "MISS";
	if (expect === "extract") return tiers.some((t) => ["extract", "duplicate"].includes(t)) ? "PASS" : "MISS";
	return tiers.includes(expect) ? "PASS" : "MISS";
};

const maybe = hasFixture ? describe : describe.skip;

maybe("adversarial entities e2e (fixture ground truth)", () => {
	const manifest = hasFixture ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { traps: [] };

	const config = main.buildConfig(fixtureDir, null, {
		roots: ["src"],
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
	});
	const result = main.run(config);

	const tiersOf = (a: { file: string; name: string }, b: { file: string; name: string }): string[] => {
		const want = pairKey(`${a.file}#${a.name}`, `${b.file}#${b.name}`);
		return result.matches
			.filter((m: any) => pairKey(`${m.a.sourceFile}#${m.a.name}`, `${m.b.sourceFile}#${m.b.name}`) === want)
			.map((m: any) => m.tier);
	};

	it("extracts entities from the whole fixture", () => {
		expect(result.entities.length).toBeGreaterThan(20);
	});

	it.each(manifest.traps.map((t: any) => [t.id, t]))("%s — %s", (_id: string, trap: any) => {
		const tiers = tiersOf(trap.a, trap.b);
		const v = verdict(trap.expect, tiers);
		// A false duplicate on a look-alike is the one unacceptable outcome.
		expect(v, `${trap.id} (${trap.title}): expected ${trap.expect}, got [${tiers.join(",") || "—"}]`).not.toBe("FAIL");
	});

	it("never flags a look-alike (expect:none) as a duplicate", () => {
		const failures = manifest.traps
			.filter((t: any) => t.expect === "none")
			.filter((t: any) => verdict(t.expect, tiersOf(t.a, t.b)) === "FAIL");
		expect(failures.map((t: any) => t.id)).toEqual([]);
	});

	it("holds the documented detection floor (no regression below 18/18)", () => {
		const pass = manifest.traps.filter((t: any) => verdict(t.expect, tiersOf(t.a, t.b)) === "PASS").length;
		// Round-15 ground truth: 18 PASS, 0 MISS, 0 FAIL — e04/e06 now caught by
		// optional/nullable folding + concrete object/array shape inference.
		expect(pass).toBeGreaterThanOrEqual(18);
	});

	it("catches the former gaps as duplicates (e04, e06)", () => {
		for (const id of ["e04", "e06"]) {
			const trap = manifest.traps.find((t: any) => t.id === id);
			expect(trap).toBeTruthy();
			expect(verdict(trap.expect, tiersOf(trap.a, trap.b))).toBe("PASS");
		}
	});
});

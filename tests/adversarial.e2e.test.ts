import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);

interface EntityRef {
	sourceFile: string;
	name: string;
}

interface Match {
	a: EntityRef;
	b: EntityRef;
	tier: string;
}

interface PipelineResult {
	entities: EntityRef[];
	matches: Match[];
}

interface TrapSide {
	file: string;
	name: string;
}

interface Trap {
	id: string;
	title: string;
	expect: string;
	a: TrapSide;
	b: TrapSide;
}

const main = require("../dist/main.js") as {
	buildConfig: (root: string, rule: unknown, args: Record<string, unknown>) => unknown;
	run: (config: unknown) => PipelineResult;
};

// ── ADVERSARIAL E2E ─────────────────────────────────────────────────────────
// Runs the real pipeline against the in-repo adversarial fixture (18 hard
// traps written by a competing "trap author" agent, now merged into
// tests/duplicates/e01…e18) and scores every trap the same way the original
// adversarial/run.cjs harness did. This locks the detector's ground truth so
// a future engine change cannot silently drop a caught trap or start flagging a
// legitimate look-alike. The fixture is part of this package — the suite always
// runs.
//
// Known, documented gaps are asserted as MISS (not silently passed). As of the
// optional/nullable + object-shape inference fixes, e04/e06 are caught as
// duplicates, so the floor is the full 18/18. e13 is correctly dropped. No trap
// may FAIL (a false duplicate on an expect:none).

const pluginDir = path.resolve(__dirname, "..");
const manifestPath = path.join(pluginDir, "tests", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { traps: Trap[] };

const pairKey = (a: string, b: string) => [a, b].sort().join("::");

// The harness verdict rules (adversarial/run.cjs), verbatim.
const verdict = (expect: string, tiers: string[]): "PASS" | "MISS" | "FAIL" => {
	if (expect === "none") return tiers.includes("duplicate") ? "FAIL" : "PASS";
	if (expect === "similar") return tiers.some((t) => ["similar", "extract", "duplicate"].includes(t)) ? "PASS" : "MISS";
	if (expect === "extract") return tiers.some((t) => ["extract", "duplicate"].includes(t)) ? "PASS" : "MISS";

	return tiers.includes(expect) ? "PASS" : "MISS";
};

describe("adversarial entities e2e (fixture ground truth)", () => {
	// The manifest paths are repo-relative (tests/duplicates/eXX/…), so the
	// pipeline runs from the package root over both consolidated fixture trees.
	const config = main.buildConfig(pluginDir, null, {
		roots: ["tests/duplicates", "tests/NOT_duplicates"],
		thresholds: null,
		weights: null,
		verbose: false,
		out: null,
		requireExported: false,
		include: null,
	});
	const result = main.run(config);

	const tiersOf = (a: TrapSide, b: TrapSide): string[] => {
		const want = pairKey(`${a.file}#${a.name}`, `${b.file}#${b.name}`);

		return result.matches
			.filter((m) => pairKey(`${m.a.sourceFile}#${m.a.name}`, `${m.b.sourceFile}#${m.b.name}`) === want)
			.map((m) => m.tier);
	};

	it("extracts entities from the whole fixture", () => {
		expect(result.entities.length).toBeGreaterThan(20);
	});

	it.each(manifest.traps.map((t) => [t.id, t] as const))("%s — %s", (_id, trap) => {
		const tiers = tiersOf(trap.a, trap.b);
		const v = verdict(trap.expect, tiers);
		// A false duplicate on a look-alike is the one unacceptable outcome.
		expect(v, `${trap.id} (${trap.title}): expected ${trap.expect}, got [${tiers.join(",") || "—"}]`).not.toBe("FAIL");
	});

	it("never flags a look-alike (expect:none) as a duplicate", () => {
		const failures = manifest.traps
			.filter((t) => t.expect === "none")
			.filter((t) => verdict(t.expect, tiersOf(t.a, t.b)) === "FAIL");
		expect(failures.map((t) => t.id)).toEqual([]);
	});

	it("holds the documented detection floor (no regression below 18/18)", () => {
		const pass = manifest.traps.filter((t) => verdict(t.expect, tiersOf(t.a, t.b)) === "PASS").length;
		// Round-15 ground truth: 18 PASS, 0 MISS, 0 FAIL — e04/e06 now caught by
		// optional/nullable folding + concrete object/array shape inference.
		expect(pass).toBeGreaterThanOrEqual(18);
	});

	it("catches the former gaps as duplicates (e04, e06)", () => {
		for (const id of ["e04", "e06"]) {
			const trap = manifest.traps.find((t) => t.id === id);
			expect(trap).toBeTruthy();
			expect(verdict(trap!.expect, tiersOf(trap!.a, trap!.b))).toBe("PASS");
		}
	});
});

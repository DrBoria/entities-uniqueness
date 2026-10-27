import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const pluginDir = path.resolve(__dirname, "..");
const mainJs = path.join(pluginDir, "main.js");
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "eu-cli-"));

afterAll(() => {
	rmSync(tmpRoot, { recursive: true, force: true });
});

const runCli = (args, opts = {}) => {
	const { spawnSync } = require("node:child_process");
	const res = spawnSync(process.execPath, [mainJs, ...args], {
		cwd: opts.cwd || pluginDir,
		encoding: "utf8",
		timeout: 240000,
	});
	if (res.error) throw res.error;
	if (res.status !== 0) throw new Error(`CLI exited ${res.status}: ${res.stderr}`);

	return `${res.stdout || ""}${res.stderr || ""}`;
};

const readReport = (report) => readFileSync(path.join(pluginDir, report), "utf8");

describe("CLI", () => {
	it("prints usage and exits 0 on --help", () => {
		const out = runCli(["--help"]);

		expect(out).toContain("Usage: entities-uniqueness");
		expect(out).toContain("--thresholds");
	});

	it("fails on an unknown argument", () => {
		expect(() => runCli(["--nope"])).toThrow();
	});

	it("requires --roots", () => {
		expect(() => runCli(["--repo-root", "."])).toThrow();
	});

	it(
		"runs the full pipeline and writes a report + catalog",
		() => {
			const report = "reports/cli-report.md";
		runCli(["--repo-root", ".", "--roots", "tests/entities", "--report", report, "--verbose"]);
		const md = readReport(report);

		expect(md).toContain("# Entity similarity report");
		expect(md).toContain("## High-confidence duplicates");
		expect(md).toContain("| UserService |");
		expect(md).toContain("| userSchema |");
		expect(md).toContain("## Clusters of similar entities");
		expect(md).toContain("ReportService");
		expect(md).toContain("## Refactor suggestions");
		expect(md).toContain("shared-base");
	},
	30_000,
	);

	it(
		"applies a --thresholds override (very high threshold removes duplicates)",
		() => {
			const report = "reports/cli-thresholds.md";
			runCli([
				"--repo-root",
				".",
				"--roots",
				"tests/entities",
				"--thresholds",
				"0.99:0.98:0.97",
				"--report",
				report,
			]);
			const md = readReport(report);

			// The forced fast-path pairs (alias, store-model-copy, identical
			// shape) are structural facts and survive any threshold.
			expect(md).toContain("Found 3 high-confidence duplicate pair(s)");
		},
		30_000,
	);

	it(
		"writes a JSONL stage log with --log",
		() => {
			const logFile = path.join(tmpRoot, "stage.log");
			runCli(["--repo-root", ".", "--roots", "tests/entities", "--log", logFile]);

			expect(existsSync(logFile)).toBe(true);
			const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
			expect(lines.length).toBeGreaterThan(0);
			expect(() => JSON.parse(lines[0])).not.toThrow();
		},
		30_000,
	);

	it(
		"--files scans only the listed files without --roots and skips the catalog",
		() => {
			const report = "reports/cli-files.md";
			const catalog = path.join(pluginDir, "reports", "entities-catalog.json");
			const before = existsSync(catalog) ? readFileSync(catalog, "utf8") : null;
			const out = runCli(["--repo-root", ".", "--files", "tests/entities/reports/ReportService.ts", "--report", report]);
			const md = readReport(report);

			expect(out).toContain("scanned 1 file(s), 1 entity");
			expect(md).toContain("Scanned 1 file(s), found 1 entity");
			// a single-file scan must not clobber the folder-based catalog
			expect(existsSync(catalog) ? readFileSync(catalog, "utf8") : null).toBe(before);
			expect(out).not.toContain("export →");
		},
		30_000,
	);

	it(
		"--files silently skips missing files",
		() => {
			const report = "reports/cli-files-missing.md";
			const out = runCli(["--repo-root", ".", "--files", "tests/entities/does-not-exist.ts", "--report", report]);

			expect(out).toContain("scanned 0 file(s)");
		},
		30_000,
	);
});

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
	const stdout = execFileSync(process.execPath, [mainJs, ...args], {
		cwd: opts.cwd || pluginDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 240000,
	});

	return stdout;
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

	it("runs the full pipeline and writes a report + catalog", () => {
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
	});

	it("applies a --thresholds override (very high threshold removes duplicates)", () => {
		const report = "reports/cli-thresholds.md";
		runCli(["--repo-root", ".", "--roots", "tests/entities", "--thresholds", "0.99:0.98:0.97", "--report", report]);
		const md = readReport(report);

		expect(md).toContain("Found 0 high-confidence duplicate pair(s)");
	});

	it("writes a JSONL stage log with --log", () => {
		const logFile = path.join(tmpRoot, "stage.log");
		runCli(["--repo-root", ".", "--roots", "tests/entities", "--log", logFile]);

		expect(existsSync(logFile)).toBe(true);
		const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
		expect(lines.length).toBeGreaterThan(0);
		expect(() => JSON.parse(lines[0])).not.toThrow();
	});
});

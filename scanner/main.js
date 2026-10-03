"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipe, map, filter } = require("remeda");
const { normalizeOptions, isIgnored, DEFAULT_EXCLUDE } = require("../config");
const { resolveThresholds } = require("../thresholds");
const { findRepoRoot } = require("../debt");
const { extractFromFiles } = require("../extract");
const { match } = require("../matching");
const { walk } = require("./walk");
const { slimRecord, dedupeAndSort, writeCatalog } = require("./output");
const { loadRuleOptions } = require("./load-config");
const { renderDuplicateReport } = require("../report");

const fail = (message) => {
	console.error(`[entities-uniqueness] ${message}`);
	process.exit(1);
};

const log = (message) => {
	console.log(message);
};

const VALUE_FLAGS = {
	"--roots": (v, cfg) => {
		cfg.roots = v;
	},
	"--out": (v, cfg) => {
		cfg.out = v;
	},
	"--repo-root": (v, cfg) => {
		cfg.repoRoot = v;
	},
	"--report": (v, cfg) => {
		cfg.report = v === true ? true : v;
	},
};

const BOOL_FLAGS = {
	"--check": (cfg) => {
		cfg.check = true;
	},
	"--verbose": (cfg) => {
		cfg.verbose = true;
	},
};

const HELP_TEXT = [
	"Usage: md-code-entities-uniqueness --roots <folder[:folder...]> [--out catalog.json] [--report [file]] [--check] [--verbose]",
	"Scans the given roots for duplicate entities and writes a catalog + markdown report.",
];

const parseArgs = (argv) => {
	const cfg = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			HELP_TEXT.forEach(log);
			process.exit(0);
		}
		if (VALUE_FLAGS[arg]) {
			const next = argv[i + 1];
			if (next === undefined || next.startsWith("--")) {
				fail(`missing value for ${arg}`);
			}
			i += 1;
			VALUE_FLAGS[arg](next, cfg);
		} else if (BOOL_FLAGS[arg]) {
			BOOL_FLAGS[arg](cfg);
		} else {
			fail(`unknown argument: ${arg}`);
		}
	}
	return cfg;
};

const resolveAgainst = (value, repoRoot) => (path.isAbsolute(value) ? value : path.resolve(repoRoot, value));

const normalize = (s) => String(s).replace(/\\/g, "/").replace(/\/+$/, "");

const main = async () => {
	const cwd = process.cwd();
	const args = parseArgs(process.argv.slice(2));

	const loaded = args.roots ? null : await loadRuleOptions(cwd);
	if (loaded) log(`config: ${loaded.source}`);
	const configOptions = loaded ? loaded.options : {};

	const repoRoot = args.repoRoot ? path.resolve(cwd, args.repoRoot) : findRepoRoot(cwd) || cwd;
	const thresholds = resolveThresholds(configOptions);

	const configRoots = pipe(
		configOptions.roots || [],
		map((d) => (d && typeof d === "object" ? d.path : d)),
		map((d) => normalize(d)),
	);
	const roots = args.roots ? args.roots.split(":").map((r) => normalize(r)) : configRoots;
	if (!roots.length) fail("no roots specified (use --roots or configure in eslint.config.js)");

	const outPath = resolveAgainst(args.out || configOptions.catalogPath || "reports/entities-catalog.json", repoRoot);
	const include = configOptions.include || [];
	const exclude = configOptions.exclude || DEFAULT_EXCLUDE;
	const shouldSkip = (abs) => isIgnored(path.relative(repoRoot, abs).split(path.sep).join("/"), include, exclude);

	const files = [];
	for (const root of roots) {
		const rootDir = resolveAgainst(root, repoRoot);
		if (!fs.existsSync(rootDir)) fail(`root not found: ${rootDir}`);
		const collected = pipe(walk(rootDir), filter((f) => !shouldSkip(f)));
		files.push(...collected);
		if (args.verbose) log(`  ${root}: ${collected.length} file(s)`);
	}

	const records = extractFromFiles(files, { requireExported: thresholds.requireExported });
	const { clusters } = match(records, thresholds);

	const catalog = {
		version: 1,
		generatedAt: new Date().toISOString(),
		roots: roots.map(normalize),
		repoRoot: repoRoot.split(path.sep).join("/"),
		entities: dedupeAndSort(records).map((r) => slimRecord(r, repoRoot)),
		clusters: clusters.map((c) => ({
			canonical: slimRecord(c.canonical, repoRoot),
			members: c.members.map((m) => slimRecord(m, repoRoot)),
			tier: c.tier,
			shared: c.shared || [],
		})),
	};

	if (args.check) {
		if (!fs.existsSync(outPath)) fail(`catalog not found at ${outPath} (run without --check first)`);
		const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
		const sameEntities = JSON.stringify(existing.entities || []) === JSON.stringify(catalog.entities);
		const sameClusters = JSON.stringify(existing.clusters || []) === JSON.stringify(catalog.clusters);
		if (!sameEntities || !sameClusters) {
			fail(`catalog is out of date (${outPath}) — re-run without --check`);
		}
		log(`catalog up to date: ${outPath}`);
		return;
	}

	writeCatalog(outPath, catalog);
	log(`wrote ${outPath} (${catalog.entities.length} entit${catalog.entities.length === 1 ? "y" : "ies"}, ${catalog.clusters.length} cluster${catalog.clusters.length === 1 ? "" : "s"}, ${files.length} file${files.length === 1 ? "" : "s"} scanned)`);

	const dupReportPath = args.report === true || !args.report ? "reports/entities-duplicates.md" : args.report;
	const reportPath = path.resolve(cwd, dupReportPath);
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, renderDuplicateReport({ clusters, repoRoot, roots: catalog.roots }), "utf8");
	log(`wrote report ${reportPath} (${catalog.clusters.length} cluster${catalog.clusters.length === 1 ? "" : "s"})`);
};

main().catch((e) => fail(e.stack || e.message));

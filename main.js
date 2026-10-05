"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipe, map, filter } = require("remeda");
const { normalizeOptions, isIgnored, findRepoRoot, loadRuleOptions } = require("./config");
const { resolveThresholds } = require("./thresholds");
const { extractFromFiles } = require("./ast");
const { findPairs } = require("./matcher/pair");
const { cluster } = require("./matcher/cluster");
const { dropImplementations } = require("./filter/drop-implementations");
const { minMembersFilter } = require("./filter/min-members");
const { renderDuplicateReport } = require("./report");
const { walk, slimRecord, dedupeAndSort, writeCatalog } = require("./utils");

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
		if (arg === "--report") {
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				i += 1;
				cfg.report = next;
			} else {
				cfg.report = true;
			}
		} else if (VALUE_FLAGS[arg]) {
			const next = argv[i + 1];
			if (next === undefined || next.startsWith("--")) fail(`missing value for ${arg}`);
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

	const loaded = args.roots ? null : loadRuleOptions(cwd);
	if (loaded) log(`config: ${loaded.source}`);
	const opts = normalizeOptions(loaded ? loaded.options : {});
	const thresholds = resolveThresholds(loaded ? loaded.options : {});

	const repoRoot = args.repoRoot ? path.resolve(cwd, args.repoRoot) : findRepoRoot(cwd, opts.rootMarkers) || cwd;

	const configRoots = pipe(opts.roots, map((d) => normalize(d)));
	const roots = args.roots ? args.roots.split(":").map((r) => normalize(r)) : configRoots;
	if (!roots.length) fail("no roots specified (use --roots or configure in eslint.config.js)");

	const outPath = resolveAgainst(args.out || opts.catalogPath, repoRoot);
	const shouldSkip = (abs) => isIgnored(path.relative(repoRoot, abs).split(path.sep).join("/"), opts.include, opts.exclude);

	const files = [];
	for (const root of roots) {
		const rootDir = resolveAgainst(root, repoRoot);
		if (!fs.existsSync(rootDir)) fail(`root not found: ${rootDir}`);
		const collected = pipe(walk(rootDir, opts.exts, opts.ignoreDirs), filter((f) => !shouldSkip(f)));
		files.push(...collected);
		if (args.verbose) log(`  ${root}: ${collected.length} file(s)`);
	}

	const records = dropImplementations(extractFromFiles(files, { requireExported: thresholds.requireExported }));
	const eligible = minMembersFilter(records, { ...thresholds, ignoredSet: new Set(thresholds.ignoredMethods) });
	const pairs = findPairs(eligible, new Set(thresholds.ignoredMethods), thresholds);
	const clusters = cluster(pairs, eligible, new Set(thresholds.ignoredMethods), thresholds);

	const catalog = {
		version: 1,
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
		if (!sameEntities || !sameClusters) fail(`catalog is out of date (${outPath}) — re-run without --check`);
		log(`catalog up to date: ${outPath}`);
		return;
	}

	writeCatalog(outPath, catalog);
	log(`wrote ${outPath} (${catalog.entities.length} entit${catalog.entities.length === 1 ? "y" : "ies"}, ${catalog.clusters.length} cluster${catalog.clusters.length === 1 ? "" : "s"}, ${files.length} file${files.length === 1 ? "" : "s"} scanned)`);

	if (args.report) {
		const dupReportPath = args.report === true ? "reports/entities-duplicates.md" : args.report;
		const reportPath = path.resolve(cwd, dupReportPath);
		fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		fs.writeFileSync(reportPath, renderDuplicateReport({ clusters, repoRoot, roots: catalog.roots }), "utf8");
		log(`wrote report ${reportPath} (${catalog.clusters.length} cluster${catalog.clusters.length === 1 ? "" : "s"})`);
	}
};

main().catch((e) => fail(e.stack || e.message));

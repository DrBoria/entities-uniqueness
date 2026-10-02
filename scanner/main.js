#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { findRepoRoot } = require("../debt");
const { isIgnored, DEFAULT_EXCLUDE } = require("../config");
const { resolveThresholds } = require("../thresholds");
const { loadRuleOptions } = require("./load-config");
const { walk } = require("./walk");
const { extractFromFiles } = require("../extract");
const { match } = require("../matching");
const { dedupeAndSort, slimRecord, writeCatalog } = require("./output");
const { renderDuplicateReport } = require("../report");

function fail(message) {
	// eslint-disable-next-line no-console
	console.error(`[entities-uniqueness] ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const cfg = { roots: null, out: null, repoRoot: null, check: false, report: null, verbose: false };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--check") {
			cfg.check = true;
		} else if (a === "--report") {
			const next = argv[i + 1];
			if (next && !next.startsWith("--")) cfg.report = argv[++i];
			else cfg.report = true;
		} else if (a === "--roots") {
			if (!argv[i + 1]) fail("--roots requires a value (colon-separated list of directories)");
			cfg.roots = argv[++i].split(":").filter(Boolean);
		} else if (a === "--out") {
			if (!argv[i + 1]) fail("--out requires a value");
			cfg.out = argv[++i];
		} else if (a === "--repo-root") {
			if (!argv[i + 1]) fail("--repo-root requires a value");
			cfg.repoRoot = argv[++i];
		} else if (a === "--verbose") {
			cfg.verbose = true;
		} else if (a === "--help" || a === "-h") {
			// eslint-disable-next-line no-console
			console.log("Usage: md-code-entities-uniqueness [--report file.md] [--verbose]");
			// eslint-disable-next-line no-console
			console.log("Scans for duplicate entities (classes / interfaces / objects / constructors) → reports/entities-duplicates.md.");
			// eslint-disable-next-line no-console
			console.log("Scan roots come from the consumer's eslint.config.js (rule md-code/entities-uniqueness) or md-code-entities-uniqueness.config.js.");
			process.exit(0);
		} else {
			fail(`unknown argument: ${a} (see --help)`);
		}
	}
	return cfg;
}

function resolveAgainst(value, repoRoot) {
	return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const cwd = process.cwd();

	const loaded = args.roots ? null : await loadRuleOptions(cwd);
	const configOptions = loaded ? loaded.options : {};
	if (loaded) {
		// eslint-disable-next-line no-console
		console.log(`[entities-uniqueness] config from ${loaded.source}`);
	}

	const repoRoot = args.repoRoot ? path.resolve(cwd, args.repoRoot) : findRepoRoot(cwd) || cwd;
	const thresholds = resolveThresholds(configOptions);

	const configRoots = (configOptions.roots || []).map((d) => (d && typeof d === "object" ? d.path : d)).map((d) => String(d).replace(/\\/g, "/").replace(/\/+$/, ""));
	const roots = args.roots || configRoots;
	if (!roots || roots.length === 0) {
		fail("no scan roots: pass --roots <dir1>:<dir2> or set roots in the rule options (eslint.config.js / md-code-entities-uniqueness.config.js)");
	}

	const outPath = resolveAgainst(args.out || configOptions.catalogPath || "reports/entities-catalog.json", repoRoot);
	const include = configOptions.include || [];
	const exclude = configOptions.exclude || DEFAULT_EXCLUDE;
	const shouldSkip = (abs) => isIgnored(path.relative(repoRoot, abs).split(path.sep).join("/"), include, exclude);

	const files = [];
	for (const relRoot of roots) {
		const rootDir = resolveAgainst(relRoot, repoRoot);
		if (!fs.existsSync(rootDir)) {
			fail(`scan root does not exist: ${relRoot}`);
		}
		for (const file of walk(rootDir)) {
			if (shouldSkip(file)) continue;
			files.push(file);
		}
	}
	if (args.verbose) {
		// eslint-disable-next-line no-console
		console.log(`[entities-uniqueness] ${files.length} file(s) to extract`);
	}
	const records = extractFromFiles(files, { requireExported: thresholds.requireExported });
	if (args.verbose) {
		// eslint-disable-next-line no-console
		console.log(`[entities-uniqueness] ${records.length} entit(y/ies) extracted`);
	}

	const { clusters } = match(records, thresholds);
	if (args.verbose) {
		// eslint-disable-next-line no-console
		console.log(`[entities-uniqueness] ${clusters.length} duplicate cluster(s)`);
	}

	const catalog = {
		version: 1,
		generatedAt: new Date().toISOString(),
		roots: roots.map((d) => String(d).replace(/\\/g, "/").replace(/\/+$/, "")),
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
		let current = null;
		try {
			current = JSON.parse(fs.readFileSync(outPath, "utf8"));
		} catch {
			// missing catalog — a change
		}
		const same =
			current &&
			JSON.stringify(current.entities || []) === JSON.stringify(catalog.entities) &&
			JSON.stringify(current.clusters || []) === JSON.stringify(catalog.clusters);
		if (!same) {
			fail(`catalog is out of date (${catalog.entities.length} entit(y/ies), ${catalog.clusters.length} cluster(s) at ${path.relative(repoRoot, outPath)}); regenerate it (md-code-entities-uniqueness)`);
		}
		// eslint-disable-next-line no-console
		console.log(`[entities-uniqueness] catalog up to date (${catalog.entities.length} entit(y/ies), ${catalog.clusters.length} cluster(s))`);
		return;
	}

	writeCatalog(outPath, catalog);
	// eslint-disable-next-line no-console
	console.log(`[entities-uniqueness] wrote ${path.relative(repoRoot, outPath)} (${catalog.entities.length} entit(y/ies), ${catalog.clusters.length} cluster(s), ${files.length} file(s) scanned)`);

	const dupReportPath = args.report === true || !args.report ? "reports/entities-duplicates.md" : args.report;
	const reportPath = path.isAbsolute(dupReportPath) ? dupReportPath : path.resolve(cwd, dupReportPath);
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, renderDuplicateReport({ clusters, repoRoot, roots: catalog.roots }), "utf8");
	// eslint-disable-next-line no-console
	console.log(`[entities-uniqueness] wrote report ${reportPath} (${clusters.length} cluster(s))`);
}

main().catch((e) => fail(e.stack || e.message));

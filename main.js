#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { findRepoRoot, isIgnored, DEFAULT_EXTS, DEFAULT_IGNORE_DIRS, loadRuleOptions, loadCatalog } = require("./config");
const { walk, relPosix, writeJson } = require("./utils");
const { parseAndExtract } = require("./normalizer");
const { normalizeEntities } = require("./frameworks/entrypoint");
const { matchSignals } = require("./matcher");
const { findCandidates } = require("./matcher/candidates");
const { clusterMatches } = require("./matcher/cluster");
const { resolveTuning } = require("./tuning");
const { decide, decideFacts } = require("./decision-maker");
const { buildTrees } = require("./tree-builder");
const { applyFilters } = require("./filter");
const { suggest } = require("./suggester");
const { renderEntityReport } = require("./report");
const log = require("./logger");

const fail = (message) => {
	console.error(`[entities-uniqueness] ${message}`);
	process.exit(1);
};

const parseArgs = (argv) => {
	const cfg = { roots: null, out: null, repoRoot: null, check: false, report: null, include: null, log: null, thresholds: null, verbose: false, configFile: null, requireExported: false };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--check") {
			cfg.check = true;
		} else if (a === "--report") {
			const next = argv[i + 1];
			cfg.report = next && !next.startsWith("--") ? argv[++i] : "reports/entities-similarity.md";
		} else if (a === "--roots") {
			if (!argv[i + 1]) fail("--roots requires a value (colon-separated list of directories)");
			cfg.roots = argv[++i].split(":").filter(Boolean);
		} else if (a === "--out") {
			if (!argv[i + 1]) fail("--out requires a value");
			cfg.out = argv[++i];
		} else if (a === "--repo-root") {
			if (!argv[i + 1]) fail("--repo-root requires a value");
			cfg.repoRoot = argv[++i];
		} else if (a === "--include") {
			if (!argv[i + 1]) fail("--include requires a value (colon-separated list of file globs, e.g. a.ts:b.ts)");
			cfg.include = argv[++i].split(":").filter(Boolean);
		} else if (a === "--log") {
			if (!argv[i + 1]) fail("--log requires a value (path to the stage log file)");
			cfg.log = argv[++i];
		} else if (a === "--thresholds") {
			if (!argv[i + 1]) fail("--thresholds requires a value (duplicate:extract:similar, e.g. 0.85:0.55:0.35)");
			const parts = argv[++i].split(":").map((s) => Number.parseFloat(s));
			if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) fail("--thresholds must be three numbers separated by colons (duplicate:extract:similar)");
			cfg.thresholds = { duplicate: parts[0], extract: parts[1], similar: parts[2] };
		} else if (a === "--require-exported") {
			cfg.requireExported = true;
		} else if (a === "--verbose") {
			cfg.verbose = true;
		} else if (a === "--config") {
			if (!argv[i + 1]) fail("--config requires a value (path to an eslint.config.js or a standalone options file)");
			cfg.configFile = argv[++i];
		} else if (a === "--help" || a === "-h") {
			console.log("Usage: entities-uniqueness [--roots a:b] [--out file] [--repo-root dir] [--check] [--report [file.md]] [--include a.ts:b.ts] [--thresholds dup:ext:sim] [--require-exported] [--config file] [--log file] [--verbose]");
			console.log("Rule options (roots, weights, thresholds, ignoredProperties, include, exts) are read from the consumer's eslint.config.js (rule md-code/entities-uniqueness) or md-code-entities-uniqueness.config.js; --config points to a specific file. CLI flags override the config.");
			process.exit(0);
		} else {
			fail(`unknown argument: ${a} (see --help)`);
		}
	}
	return cfg;
};

const resolveAgainst = (value, repoRoot) => (path.isAbsolute(value) ? value : path.resolve(repoRoot, value));

// Assemble the effective config: rule options (from eslint/standalone config)
// as the base, CLI flags overriding. Roots are plain directory paths.
const buildConfig = (root, ruleOptions, args) => {
	const ro = (ruleOptions && ruleOptions.options) || {};
	const weights = { ...(ro.weights || {}), ...(args.weights || {}) };
	const thresholds = { ...(ro.thresholds || {}), ...(args.thresholds || {}) };
	// Central tuning: rule options first, weights/thresholds overrides on top.
	const tuning = resolveTuning({ ...(ro.tuning || {}), weights, thresholds });
	const exts = Array.isArray(ro.exts) && ro.exts.length ? ro.exts.map(String) : DEFAULT_EXTS;
	const ignoreDirs = ro.ignoreDirs ? [...new Set([...DEFAULT_IGNORE_DIRS, ...ro.ignoreDirs.map(String)])] : DEFAULT_IGNORE_DIRS;
	const include = args.include ? args.include.map(String) : Array.isArray(ro.include) ? ro.include.map(String) : [];
	const exclude = Array.isArray(ro.exclude) && ro.exclude.length ? ro.exclude.map(String) : [];
	// Noise members are config-supplied only — the framework never invents a
	// default list. Rule options accept `ignoredProperties` (the consumer-facing
	// name) or `ignoredMembers`; CLI `ignoredMembers` still wins.
	const ignoredMembers = Array.isArray(args.ignoredMembers)
		? args.ignoredMembers.map(String)
		: Array.isArray(ro.ignoredProperties)
			? ro.ignoredProperties.map(String)
			: Array.isArray(ro.ignoredMembers)
				? ro.ignoredMembers.map(String)
				: [];

	return {
		root,
		weights,
		thresholds,
		tuning,
		ignoredMembers,
		roots: (args.roots || (Array.isArray(ro.roots) ? ro.roots : [])).map(String),
		include,
		exclude,
		requireExported: args.requireExported || ro.requireExported === true,
		exts,
		ignoreDirs,
		verbose: args.verbose,
		out: args.out,
	};
};

const collectFiles = (roots, repoRoot, config) => {
	const files = [];
	let count = 0;
	for (const relRoot of roots) {
		const rootDir = resolveAgainst(relRoot, repoRoot);
		if (!fs.existsSync(rootDir)) continue;
		for (const file of walk(rootDir, config.exts, config.ignoreDirs)) {
			const rel = relPosix(repoRoot, file);
			if (isIgnored(rel, config.include, config.exclude)) continue;
			count += 1;
			files.push({ file, rel });
		}
	}

	return { files, count };
};

// Extract + framework-normalize entities from a set of files.
const extractEntities = (files, config) => {
	const entities = [];
	for (const { file, rel } of files) {
		let ctx;
		try {
			ctx = parseAndExtract(file, { requireExported: config.requireExported });
		} catch (err) {
			console.warn(`[entities-uniqueness] could not parse ${rel}: ${err && err.message ? err.message : err}`);
			continue;
		}
		const base = ctx.entities;
		if (log.enabled() && config.verbose) log.stage("normalizer:before", { file: rel, entities: base.map((e) => ({ name: e.name, kind: e.kind })) });
		const normalized = normalizeEntities(base, ctx);
		for (const e of normalized) {
			const withPath = { ...e, sourceFile: rel };
			if (log.enabled() && config.verbose) log.stage("normalizer:after", { file: rel, name: e.name, kind: e.kind, framework: e.framework, props: e.properties.length, methods: e.methods.length, exported: e.exported });
			entities.push(withPath);
		}
	}

	return entities;
};

// Match every unordered pair of entities (the whole included set, not vs a
// reference folder).
const matchPairs = (entities, config) => {
	const matches = [];
	const opts = { ignoredMembers: config.ignoredMembers, tuning: config.tuning };
	for (let i = 0; i < entities.length; i += 1) {
		for (let j = i + 1; j < entities.length; j += 1) {
			const a = entities[i];
			const b = entities[j];
			if (a.sourceFile === b.sourceFile && a.name === b.name) continue;
			if (log.enabled() && config.verbose) log.stage("matcher:before", { a: { name: a.name, path: a.sourceFile, kind: a.kind, props: (a.properties || []).length, methods: (a.methods || []).length }, b: { name: b.name, path: b.sourceFile, kind: b.kind, props: (b.properties || []).length, methods: (b.methods || []).length } });
			const signals = matchSignals(a, b, opts);
			if (log.enabled() && config.verbose) log.stage("matcher:after", { a: { name: a.name, path: a.sourceFile }, b: { name: b.name, path: b.sourceFile }, signals: Object.fromEntries(Object.entries(signals).map(([k, s]) => [k, { score: s.score, hasEvidence: s.hasEvidence !== false, evidence: s.evidence }])) });
			const decision = decide(a, b, { signals, weights: config.weights, thresholds: config.thresholds });
			if (log.enabled() && config.verbose) log.stage("decision:after", { a: { name: a.name, path: a.sourceFile }, b: { name: b.name, path: b.sourceFile }, confidence: decision.confidence, tier: decision.tier, contributions: decision.contributions, evidencing: decision.evidencing });
			if (!decision.tier) continue;
			matches.push({ a, b, decision, tier: decision.tier, reason: decision.reason });
		}
	}

	return matches;
};

const dedupPairs = (matches) => {
	const best = new Map();
	for (const m of matches) {
		const key = [m.a.id, m.b.id].sort().join("::");
		const prev = best.get(key);
		if (!prev || m.decision.confidence > prev.decision.confidence) best.set(key, m);
	}

	return [...best.values()];
};

// Runs the full pipeline and returns the result object (also used by tests).
const run = (config) => {
	if (log.enabled()) log.stage("pipeline:start", { roots: config.roots, weights: config.weights, thresholds: config.thresholds, requireExported: config.requireExported, ignoredMembers: config.ignoredMembers });
	const { files, count } = collectFiles(config.roots, config.root, config);
	if (log.enabled()) log.stage("collector:after", { fileCount: count, files: files.map((f) => f.rel) });
	const entities = extractEntities(files, config);
	const rawMatches = matchPairs(entities, config);
	const { kept, dropped } = applyFilters(rawMatches, { tuning: config.tuning.filters });
	const matches = dedupPairs(kept);
	const clusters = clusterMatches(matches, { clusterFloor: config.tuning.cluster.linkFloor });
	const suggestions = suggest(clusters, { tuning: config.tuning.suggester });

	// New architecture: raw candidates -> one decision pass -> tree assembly.
	const candidates = findCandidates(entities, { ignoredMembers: config.ignoredMembers, tuning: config.tuning });
	const facts = decideFacts(candidates, { weights: config.weights, thresholds: config.thresholds, tuning: config.tuning, ignoredMembers: config.ignoredMembers });
	const trees = buildTrees(facts, entities);

	if (log.enabled()) {
		const tierCounts = { duplicate: 0, extract: 0, similar: 0 };
		for (const m of matches) tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1;
		const factCounts = { inclusion: 0, extract: 0 };
		for (const f of facts) factCounts[f.type] = (factCounts[f.type] || 0) + 1;
		log.stage("pipeline:done", { files: count, entities: entities.length, rawMatches: rawMatches.length, kept: kept.length, dropped: dropped.length, finalMatches: matches.length, clusters: clusters.length, suggestions: suggestions.length, tierCounts, candidates: candidates.length, facts: facts.length, factCounts, trees: trees.trees.length, extracts: trees.extracts.length });
	}

	return {
		files: count,
		entityCount: entities.length,
		entities,
		matches,
		dropped,
		clusters,
		suggestions,
		candidates,
		facts,
		trees,
		weights: config.weights,
		thresholds: config.thresholds,
		verbose: config.verbose,
	};
};

const writeCatalog = (config, result) => {
	const catalog = {
		generatedAt: new Date().toISOString(),
		root: config.root,
		weights: config.weights,
		thresholds: config.thresholds,
		files: result.files,
		entityCount: result.entityCount,
		entities: result.entities.map((e) => ({
			id: e.id,
			name: e.name,
			kind: e.kind,
			sourceFile: e.sourceFile,
			line: e.line,
			endLine: e.endLine,
			exported: e.exported,
			framework: e.framework,
			properties: e.properties,
			methods: e.methods,
			extends: e.extends,
			implements: e.implements,
			complexity: e.complexity,
		})),
		matches: result.matches.map((m) => ({
			a: { name: m.a.name, sourceFile: m.a.sourceFile, line: m.a.line, kind: m.a.kind, framework: m.a.framework },
			b: { name: m.b.name, sourceFile: m.b.sourceFile, line: m.b.line, kind: m.b.kind, framework: m.b.framework },
			confidence: m.decision.confidence,
			tier: m.tier,
			reason: m.reason,
			signals: Object.fromEntries(Object.entries(m.decision.signals).map(([k, s]) => [k, s && s.hasEvidence !== false ? s.score : null])),
		})),
		clusters: result.clusters.map((c) => ({ members: c.members.map((m) => m.name) })),
		suggestions: result.suggestions,
		candidates: (result.candidates || []).map((c) => ({
			a: { name: c.a.name, sourceFile: c.a.sourceFile, line: c.a.line },
			b: { name: c.b.name, sourceFile: c.b.sourceFile, line: c.b.line },
			kind: c.kind,
			rawMetrics: c.rawMetrics,
		})),
		facts: (result.facts || []).map((f) =>
			f.type === "inclusion"
				? { type: f.type, parent: f.parent.name, child: f.child.name, score: f.score, rawMetrics: f.rawMetrics }
				: { type: f.type, left: f.left.name, right: f.right.name, shared: f.shared, score: f.score, suggest: f.suggest, rawMetrics: f.rawMetrics },
		),
		trees: {
			trees: (result.trees && result.trees.trees ? result.trees.trees : []).map((t) => ({
				name: t.entity.name,
				sourceFile: t.entity.sourceFile,
				line: t.entity.line,
				children: t.children.map((c) => ({ name: c.entity.name, sourceFile: c.entity.sourceFile, line: c.entity.line, children: c.children.map((g) => ({ name: g.entity.name, sourceFile: g.entity.sourceFile, line: g.entity.line })) })),
			})),
			extracts: (result.trees && result.trees.extracts ? result.trees.extracts : []).map((x) => ({
				left: x.left.name,
				right: x.right.name,
				shared: x.shared,
				score: x.score,
				suggest: x.suggest,
			})),
		},
	};
	const outPath = config.out ? resolveAgainst(config.out, config.root) : path.join(config.root, "reports/entities-catalog.json");
	writeJson(outPath, catalog);

	return outPath;
};

const main = async (argv) => {
	const args = parseArgs(argv);
	if (args.log) log.enable(args.log);
	const root = args.repoRoot ? resolveAgainst(args.repoRoot, process.cwd()) : findRepoRoot(process.cwd());
	if (!root) fail("could not locate a repository root (no package.json with a root marker)");
	const ruleOptions = await loadRuleOptions(root, args.configFile);
	const config = buildConfig(root, ruleOptions, args);
	if (!config.roots || config.roots.length === 0) fail("--roots is required (colon-separated list of directories)");

	const result = run(config);
	const exportPath = writeCatalog(config, result);

	if (args.report) {
		const reportPath = resolveAgainst(args.report, config.root);
		fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		fs.writeFileSync(reportPath, renderEntityReport(result), "utf8");
	}

	const dupCount = result.matches.filter((m) => m.tier === "duplicate").length;
	const extractCount = result.matches.filter((m) => m.tier === "extract").length;
	console.error(`[entities-uniqueness] scanned ${result.files} file(s), ${result.entityCount} entit${result.entityCount === 1 ? "y" : "ies"}; ${dupCount} duplicate pair(s), ${extractCount} extraction candidate pair(s); export → ${path.relative(process.cwd(), exportPath)}`);

	if (args.check && dupCount > 0) {
		console.error(`[entities-uniqueness] --check: found ${dupCount} high-confidence duplicate pair(s)`);
		process.exitCode = 1;
	}

	return result;
};

if (require.main === module) {
	main(process.argv.slice(2)).catch((err) => {
		console.error(`[entities-uniqueness] ${err && err.message ? err.message : err}`);
		process.exit(1);
	});
}

module.exports = { run, main, parseArgs, buildConfig, collectFiles, extractEntities, matchPairs, dedupPairs, writeCatalog, applyFilters, decide, matchSignals, clusterMatches, suggest, renderEntityReport, loadCatalog, loadRuleOptions, findRepoRoot };

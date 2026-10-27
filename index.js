"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, isIgnored, RULE_NAME, RULE_SHORT } = require("./config");
const { extractEntities, matchEntityAgainst, applyFilters, dedupPairs } = require("./main");
const { refreshCatalog } = require("./self-catalog");
const { resolveTuning } = require("./tuning");

const DEFAULT_EXPORT = "reports/entities-catalog.json";

// Severity per tier: duplicates are hard errors, extraction candidates are warnings.
const TIER_SEVERITY = { duplicate: "error", extract: "warn", similar: "off" };

// Re-run the match pipeline in-process so the CURRENT file is always judged
// from its live in-memory source, not from the (possibly stale) on-disk
// catalog. The cached catalog supplies the OTHER files' entities — that is the
// "cache WHAT to compare against" part; the changed file is re-extracted and
// compared live on every save. Returns matches in the same flattened shape the
// catalog stores ({a, b, confidence, tier, reason}), limited to pairs that
// involve the current file. Returns null when the file cannot be parsed or no
// live source is available (in which case the caller falls back to the catalog).
const computeLiveMatches = ({ context, options, root, relPath, catalog }) => {
	try {
		// ESLint 9/10 expose the source as the `context.sourceCode` property;
		// the `getSourceCode()` method was removed in ESLint 10. Support both
		// shapes (a SourceCode object or a raw string).
		const sourceCode = context.sourceCode || (context.getSourceCode ? context.getSourceCode() : null);
		const text = sourceCode === null ? null : typeof sourceCode === "string" ? sourceCode : typeof sourceCode.text === "string" ? sourceCode.text : null;
		if (text === null) return null;

		const currentEntities = extractEntities([{ file: filenameOf(context, root), rel: relPath }], liveConfig(options, catalog), { [relPath]: text });
		if (!currentEntities || currentEntities.length === 0) return [];

		// The cached catalog's entities for every OTHER file are the comparison
		// set. Entities already in the current file are dropped (they are now
		// represented by the freshly extracted `currentEntities`). Entities whose
		// source file no longer exists are dropped too — the background refresher
		// will prune them from the catalog, but until it finishes, a deleted
		// duplicate must not keep flagging its twin in real time. The current
		// file's own catalog entries are excluded here — the live parse is the
		// source of truth for them.
		const otherEntities = (Array.isArray(catalog.entities) ? catalog.entities : []).filter((e) => e && e.sourceFile !== relPath && e.sourceFile && fileStillExists(root, e.sourceFile));
		// Only the live file's entities are compared (O(n) each), never the
		// full O(n^2) over the whole catalog — that is what made a save take
		// minutes on a large repo. Each live entity is matched against the
		// other files' catalog entities AND against its siblings in the same
		// file (matchEntityAgainst skips only same-file + same-name, so two
		// duplicates living in one file are still compared).
		const cfg = liveConfig(options, catalog);
		const rawMatches = currentEntities.flatMap((e) => [...matchEntityAgainst(e, otherEntities, cfg), ...matchEntityAgainst(e, currentEntities, cfg)]);
		const { kept } = applyFilters(rawMatches, { tuning: resolveTuning(options.tuning).filters });
		const matches = dedupPairs(kept);

		return matches
			.filter((m) => m.a.sourceFile === relPath || m.b.sourceFile === relPath)
			.map((m) => ({
				a: { name: m.a.name, sourceFile: m.a.sourceFile, line: m.a.line, kind: m.a.kind, framework: m.a.framework },
				b: { name: m.b.name, sourceFile: m.b.sourceFile, line: m.b.line, kind: m.b.kind, framework: m.b.framework },
				confidence: m.decision.confidence,
				tier: m.tier,
				reason: m.reason,
			}));
	} catch {
		// Any in-process failure falls back to the on-disk catalog so the rule
		// degrades gracefully instead of crashing the lint pass.
		return Array.isArray(catalog.matches) ? catalog.matches : null;
	}
};

// Per-process cache of "does this catalog file still exist on disk". The
// catalog can reference files that were deleted since the last refresh; those
// entities must not keep flagging their twins until the background refresher
// prunes the catalog. Only positive results are cached, so a file re-created
// later is picked up on its next check.
const existingFiles = new Map();
const fileStillExists = (root, rel) => {
	if (existingFiles.has(rel)) return true;
	const ok = fs.existsSync(path.join(root, rel));
	if (ok) existingFiles.set(rel, true);

	return ok;
};

// Minimal config for the in-process pipeline. Weights/thresholds come from the
// cached catalog (the single source of truth the refresher wrote), falling back
// to the tuning defaults; `tuning` is resolved so partial overrides keep defaults.
const liveConfig = (options, catalog) => {
	const tuning = resolveTuning(options.tuning);

	return {
		requireExported: Boolean(options.requireExported),
		ignoredMembers: options.ignoredMembers || [],
		weights: catalog && catalog.weights ? catalog.weights : tuning.weights,
		thresholds: catalog && catalog.thresholds ? catalog.thresholds : tuning.thresholds,
		tuning,
	};
};

// The absolute path of the file being linted (ts-morph only needs it for the
// script kind and the entity id; the source text is supplied separately).
const filenameOf = (context, root) => {
	const filename = context.filename || (context.getFilename ? context.getFilename() : "");
	const abs = path.isAbsolute(filename) ? filename : path.join(root, filename);

	return abs;
};

const createRule = () => {
	return {
		meta: {
			type: "problem",
			docs: {
				description: "Flag entities (classes, interfaces, type shapes, stores) that are near-duplicates of another entity in the catalog — they should be declared once.",
			},
			messages: {
				duplicateEntity: "Entity \"{{name}}\" is a duplicate of \"{{other}}\" in {{path}} ({{reason}}).",
				nearDuplicateEntity: "Entity \"{{name}}\" is a near-duplicate of \"{{other}}\" in {{path}} ({{reason}}).",
			},
			schema: [
				{
					type: "object",
					properties: {
						catalog: { type: "array" },
						exportPath: { type: "string" },
						weights: { type: "object" },
						thresholds: { type: "object" },
						include: { type: "array" },
						exclude: { type: "array" },
						roots: { type: "array" },
						ignoredProperties: { type: "array", items: { type: "string" } },
						ignoredMembers: { type: "array", items: { type: "string" } },
						tuning: { type: "object" },
						requireExported: { type: "boolean" },
						exts: { type: "array", items: { type: "string" } },
						ignoreDirs: { type: "array", items: { type: "string" } },
						cache: {
							type: "boolean",
							description:
								"Self-maintain the catalog: on each lint, walk the roots, re-extract only files that changed (mtime+size cache in a temp file) and rewrite the catalog. Default true. Set false to maintain the catalog externally.",
						},
						root: { type: "string" },
					},
					additionalProperties: false,
				},
			],
		},
		create(context) {
			const options = context.options && context.options[0] ? context.options[0] : {};
			const filename = context.filename || (context.getFilename ? context.getFilename() : "");
			const root = options.root || context.cwd || process.cwd();
			const relPath = path.relative(root, filename).split(path.sep).join("/");

			// Excluded files (tests, stories, ...) are never linted AND never
			// cataloged — they must not flag or be flagged by real code.
			if (isIgnored(relPath, options.include || [], options.exclude || [])) return {};

			// Inline catalog (rule option) wins over the on-disk catalog.
			let catalog = null;
			if (Array.isArray(options.catalog) && options.catalog.length > 0) {
				catalog = { entities: [], matches: options.catalog };
			} else {
				// Self-maintained catalog: walk the roots, re-extract only files
				// that changed since the last lint (per-file mtime+size cache in
				// a temp file), rewrite the catalog. ~0ms when nothing changed,
				// ~100-300ms for one changed file. The current file is always
				// re-extracted from its live editor buffer below, so unsaved
				// edits are never missed.
				if (options.cache !== false) refreshCatalog({ ...options, root, exportPath: options.exportPath || DEFAULT_EXPORT });
				catalog = loadCatalog({ root, exportPath: options.exportPath || DEFAULT_EXPORT });
			}
			if (!catalog) return {};

			// Re-extract the CURRENT file from its live in-memory source and
			// re-run the match pipeline in-process against the cached catalog of
			// the other files. This is what makes the rule correct in real time:
			// add a duplicate → it is extracted now and flagged; delete it → it is
			// gone now and the flag clears. It does not depend on the spawned
			// refresher having succeeded (which is unreliable in the electron
			// server), so the editor never shows a frozen/stale diagnostic.
			const matches = computeLiveMatches({ context, options, root, relPath, catalog });
			if (!matches) return {};

			return {
				"Program:exit"() {
					// An entity can match several others (e.g. three identical
					// object literals all match each other). Report only the
					// single best (highest-confidence) match per entity so the
					// diagnostic points at one concrete duplicate instead of a
					// stack of near-identical lines.
					const best = new Map();
					for (const m of matches) {
						for (const { self, other } of [
							{ self: m.a, other: m.b },
							{ self: m.b, other: m.a },
						]) {
							if (self.sourceFile !== relPath) continue;
							const severity = TIER_SEVERITY[m.tier] || "off";
							if (severity === "off") continue;
							const key = `${self.name}#${self.line}`;
							const prev = best.get(key);
							if (!prev || (m.confidence || 0) > (prev.confidence || 0)) {
								best.set(key, { self, other, confidence: m.confidence || 0, reason: m.reason || "", tier: m.tier });
							}
						}
					}
					for (const { self, other, reason, tier } of best.values()) {
						const line = self.line || 1;
						// NOTE: ESLint ignores a per-report `severity` — the
						// diagnostic severity is always the rule's configured
						// severity (see linter.js `report.addRuleMessage(ruleId,
						// severity, ...args)`), so the tier is conveyed via the
						// message ("duplicate" vs "near-duplicate") and the
						// reason string, not the severity level.
						context.report({
							loc: { start: { line, column: 0 }, end: { line, column: 0 } },
							messageId: tier === "duplicate" ? "duplicateEntity" : "nearDuplicateEntity",
							data: { name: self.name, other: other.name, path: other.sourceFile, reason },
						});
					}
				},
			};
		},
	};
};

const rule = createRule();
const pkg = require("./package.json");

module.exports = {
	meta: {
		name: pkg.name,
		version: pkg.version,
	},
	rules: {
		"entities-uniqueness": rule,
	},
};
module.exports.RULE_NAME = RULE_NAME;
module.exports.RULE_SHORT = RULE_SHORT;

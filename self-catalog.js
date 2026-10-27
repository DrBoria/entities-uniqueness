"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { buildConfig, collectFiles, extractEntities } = require("./main");

// Self-maintained catalog: the rule keeps its own catalog fresh by walking the
// configured roots on every lint and re-extracting only the files whose
// mtime+size changed since the last refresh (per-file cache in os.tmpdir()).
// This is the "cache WHAT to compare against" part — the file being linted is
// always judged from its live editor buffer by the rule itself, so the disk
// catalog only ever supplies the OTHER files.
//
// Budget guard: the refresh is capped at `budgetMs`; past it the partial
// catalog is written as-is (better a slightly stale catalog than a frozen
// editor). The per-file cache makes the fast path ~0ms and a single changed
// file ~100-300ms.

const cachePathFor = (root) => {
	const key = crypto.createHash("md5").update(path.resolve(root)).digest("hex");
	return path.join(os.tmpdir(), ".md-code-cache", `entities-${key}.json`);
};

const readCache = (cachePath) => {
	try {
		const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
		return parsed && typeof parsed === "object" && parsed.files ? parsed : { files: {} };
	} catch {
		return { files: {} };
	}
};

// Refresh the on-disk catalog in place. `config` is the normalized rule config
// (see config.js normalizeOptions). Returns true when the catalog was
// rewritten (or created), false when nothing changed or the refresh was
// skipped entirely.
const refreshCatalog = (config, { budgetMs = 30000 } = {}) => {
	let wrote = false;
	const root = config.root;
	if (!root) return false;
	const pipeline = buildConfig(root, { options: config }, {});
	pipeline.out = config.exportPath;
	const catalogPath = path.isAbsolute(config.exportPath) ? config.exportPath : path.join(root, config.exportPath);
	const cachePath = cachePathFor(root);
	const started = Date.now();
	const cache = readCache(cachePath);

	const { files, count } = collectFiles(pipeline.roots, root, pipeline);
	const seen = new Set();
	let changed = 0;
	let pruned = 0;
	let budgetHit = false;

	for (const { file, rel } of files) {
		seen.add(rel);
		let stat;
		try {
			stat = fs.statSync(file);
		} catch {
			continue;
		}
		const prev = cache.files[rel];
		if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) continue;
		if (Date.now() - started > budgetMs) {
			budgetHit = true;
			break;
		}
		try {
			const entities = extractEntities([{ file, rel }], pipeline); // already carries sourceFile: rel
			cache.files[rel] = { mtimeMs: stat.mtimeMs, size: stat.size, entities };
			changed += 1;
		} catch (err) {
			// Keep the previous entities for a file that fails to parse — a
			// transient error must not silently drop half the catalog.
			if (prev) cache.files[rel] = prev;
			else cache.files[rel] = { mtimeMs: stat.mtimeMs, size: stat.size, entities: [] };
		}
	}
	for (const rel of Object.keys(cache.files)) {
		if (!seen.has(rel)) {
			delete cache.files[rel];
			pruned += 1;
		}
	}

	// The rule's runtime path re-runs its own match pipeline against
	// `catalog.entities` for the live file, so the only fields it needs from
	// the catalog are `entities` plus `weights`/`thresholds`. The heavy
	// O(n^2) match/cluster/decision pipeline is deliberately NOT run here —
	// it is what made a cold catalog refresh take minutes on a large repo.
	const entities = Object.values(cache.files).flatMap((b) => b.entities);

	if (changed > 0 || pruned > 0 || !fs.existsSync(catalogPath)) {
		try {
			fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
			const catalog = {
				generatedAt: new Date().toISOString(),
				root,
				weights: pipeline.tuning.weights,
				thresholds: pipeline.tuning.thresholds,
				files: count,
				entityCount: entities.length,
				entities: entities.map((e) => ({
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
			};
			fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");
			wrote = true;
		} catch (err) {
			console.warn(`[entities-uniqueness] self-catalog: could not write ${catalogPath}: ${err && err.message ? err.message : err}`);
			return false;
		}
	}

	try {
		fs.mkdirSync(path.dirname(cachePath), { recursive: true });
		fs.writeFileSync(cachePath, JSON.stringify(cache), "utf8");
	} catch {
		// Cache write failure is non-fatal: the catalog is already written,
		// the next lint simply re-parses more files.
	}

	if (budgetHit) console.warn("[entities-uniqueness] self-catalog: budget exhausted, catalog may be partially stale");
	return wrote;
};

module.exports = { refreshCatalog };

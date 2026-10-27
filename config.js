"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { minimatch } = require("minimatch");

// Only build artifacts and dependency trees are excluded by default — tests,
// stories and .d.ts are real code and must be scanned like everything else.
const DEFAULT_EXCLUDE = ["**/node_modules/**"];
const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx"];
// The walker does not read .gitignore, so common build-artifact names must be
// listed here explicitly ("out" is the default VS Code extension build dir).
const DEFAULT_IGNORE_DIRS = ["node_modules", "dist", "build", "out", "coverage", "storybook-static"];
const DEFAULT_ROOT_MARKERS = [".git"];

const RULE_NAME = "md-code/entities-uniqueness";
const RULE_SHORT = "md-code";

const findRepoRoot = (startDir, markers = DEFAULT_ROOT_MARKERS) => {
	const markerSet = new Set(markers);
	let dir = path.resolve(startDir);
	for (;;) {
		if (fs.existsSync(path.join(dir, "package.json")) && fs.readdirSync(dir).some((name) => markerSet.has(name))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
};

const normalizeFolders = (folders) =>
	(folders || []).map((f) => {
		const raw = f && typeof f === "object" ? f.path : f;
		let s = String(raw).trim().split(path.sep).join("/");
		while (s.startsWith("./")) s = s.slice(2);
		if (!s.endsWith("/")) s += "/";

		return s;
	});

const list = (v) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

const normalizeOptions = (opts) => {
	const o = opts && typeof opts === "object" ? opts : {};
	const rootMarkers = o.rootMarkers || DEFAULT_ROOT_MARKERS;
	const root = o.root || findRepoRoot(process.cwd(), rootMarkers);

	return {
		root,
		exportPath: o.exportPath || "reports/entities-catalog.json",
		weights: o.weights && typeof o.weights === "object" ? o.weights : null,
		thresholds: o.thresholds && typeof o.thresholds === "object" ? o.thresholds : null,
		// Central tuning (weights, thresholds, matcher discounts, cluster floor,
		// suggester minimums, filter thresholds). Partial overrides merge over
		// DEFAULT_TUNING per section — see tuning.js.
		tuning: o.tuning && typeof o.tuning === "object" ? o.tuning : null,
		// members that never count toward overlap (id, createdAt, ...). Configurable,
		// never invented here. Consumers may spell the list `ignoredProperties`.
		ignoredMembers: list(o.ignoredProperties).length ? list(o.ignoredProperties) : list(o.ignoredMembers),
		roots: normalizeFolders(o.roots || []),
		include: o.include || [],
		exclude: o.exclude || DEFAULT_EXCLUDE,
		requireExported: o.requireExported === true,
		exts: list(o.exts).length ? list(o.exts) : DEFAULT_EXTS,
		ignoreDirs: o.ignoreDirs ? [...new Set([...DEFAULT_IGNORE_DIRS, ...list(o.ignoreDirs)])] : DEFAULT_IGNORE_DIRS,
		rootMarkers,
		cache: o.cache !== false,
	};
};

const compileMatcher = (pattern) => {
	if (pattern instanceof RegExp) return (p) => pattern.test(p);
	if (typeof pattern !== "string" || pattern.length === 0) return null;
	if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
		try {
			const re = new RegExp(pattern.slice(1, -1));

			return (p) => re.test(p);
		} catch {
			return null;
		}
	}
	if (pattern.startsWith("^") && pattern.endsWith("$")) {
		try {
			const re = new RegExp(pattern);

			return (p) => re.test(p);
		} catch {
			return null;
		}
	}

	return (p) => minimatch(p, pattern);
};

const matchesPath = (m, relPath) => {
	if (m(relPath)) return true;
	const base = relPath.slice(relPath.lastIndexOf("/") + 1);

	return base !== relPath && m(base);
};

const isIgnored = (relPath, include, exclude) => {
	for (const pattern of exclude || []) {
		const m = compileMatcher(pattern);
		if (m && matchesPath(m, relPath)) return true;
	}
	if (include && include.length > 0) {
		return !include.some((pattern) => {
			const m = compileMatcher(pattern);

			return m ? matchesPath(m, relPath) : false;
		});
	}

	return false;
};

const isRuleKey = (key) => typeof key === "string" && (key === RULE_NAME || key === RULE_SHORT || key === "entities-uniqueness" || key.endsWith("/entities-uniqueness"));

const ruleValue = (rules) => {
	for (const [key, v] of Object.entries(rules || {})) {
		if (!isRuleKey(key)) continue;
		if (v === undefined || v === null) continue;

		return v;
	}

	return null;
};

const pickOptions = (v) => {
	if (v === undefined || v === null) return null;
	if (Array.isArray(v)) return v[1] && typeof v[1] === "object" ? v[1] : {};
	if (typeof v === "object") return v;

	return {};
};

const loadModule = (file) => {
	const src = fs.readFileSync(file, "utf8");
	if (file.endsWith(".json")) return Promise.resolve(JSON.parse(src));
	if (/^\s*(exports?\s+(default|const|let|var)|import\s)/m.test(src)) {
		const { pathToFileURL } = require("node:url");

		return import(pathToFileURL(file).href).catch((esmErr) => {
			try {
				return require(file);
			} catch {
				throw esmErr;
			}
		});
	}

	return Promise.resolve().then(() => require(file));
};

const loadFlatOptions = async (file) => {
	const mod = await loadModule(file);
	const list2 = mod && mod.default !== undefined ? mod.default : mod;
	if (!Array.isArray(list2)) return null;
	for (const entry of list2) {
		if (!entry || typeof entry !== "object") continue;
		const v = (entry.rules && ruleValue(entry.rules)) || null;
		if (v === undefined || v === null) continue;

		return pickOptions(v);
	}

	return null;
};

const loadLegacyOptions = async (file) => {
	const mod = await loadModule(file);
	const v = ruleValue((mod && mod.rules) || {});

	return v === undefined || v === null ? null : pickOptions(v);
};

const loadRuleOptions = async (dir, explicitFile = null) => {
	if (explicitFile) {
		const file = path.isAbsolute(explicitFile) ? explicitFile : path.resolve(dir, explicitFile);
		if (!fs.existsSync(file)) return null;
		if (file.endsWith(".json")) {
			const options = pickOptions(JSON.parse(fs.readFileSync(file, "utf8")));

			return options ? { options, source: file } : null;
		}
		try {
			const isFlat = path.basename(file).startsWith("eslint.config");
			const options = isFlat ? await loadFlatOptions(file) : pickOptions(await loadModule(file));

			return options ? { options, source: file } : null;
		} catch {
			return null;
		}
	}
	let d = dir;
	for (;;) {
		const standalone = path.join(d, "md-code-entities-uniqueness.config.js");
		if (fs.existsSync(standalone)) {
			const mod = await loadModule(standalone);
			const options = mod && mod.default !== undefined ? mod.default : mod;
			if (options && typeof options === "object") return { options, source: standalone };
		}
		for (const name of ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"]) {
			const file = path.join(d, name);
			if (!fs.existsSync(file)) continue;
			try {
				const options = await loadFlatOptions(file);
				if (options) return { options, source: file };
			} catch {}
		}
		for (const name of [".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"]) {
			const file = path.join(d, name);
			if (!fs.existsSync(file)) continue;
			try {
				const options = await loadLegacyOptions(file);
				if (options) return { options, source: file };
			} catch {}
		}
		const parent = path.dirname(d);
		if (parent === d) break;
		d = parent;
	}

	return null;
};

const loadCatalog = (config) => {
	const file = path.isAbsolute(config.exportPath) ? config.exportPath : path.join(config.root, config.exportPath);
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

		return parsed && Array.isArray(parsed.entities) ? parsed : null;
	} catch {
		return null;
	}
};

module.exports = {
	RULE_NAME,
	RULE_SHORT,
	DEFAULT_EXCLUDE,
	DEFAULT_EXTS,
	DEFAULT_IGNORE_DIRS,
	DEFAULT_ROOT_MARKERS,
	findRepoRoot,
	normalizeFolders,
	normalizeOptions,
	isIgnored,
	loadRuleOptions,
	loadCatalog,
};

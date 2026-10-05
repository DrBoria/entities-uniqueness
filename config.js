"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { minimatch } = require("minimatch");
const { pipe, map, filter, first } = require("remeda");

const RULE_ID = "entities-uniqueness";

const DEFAULTS = {
	exts: [".ts", ".tsx", ".js", ".jsx"],
	ignoreDirs: ["node_modules", "dist", "build"],
	rootMarkers: [".git"],
};

const resolveDataPath = (value, root) => {
	if (path.isAbsolute(value)) return value;
	const base = root || process.cwd();
	return path.resolve(base, value);
};

const normalizeFolders = (folders) =>
	pipe(
		folders || [],
		map((f) => {
			const raw = f && typeof f === "object" ? f.path : f;
			let s = String(raw).trim().split(path.sep).join("/");
			while (s.startsWith("./")) s = s.slice(2);
			if (!s.endsWith("/")) s += "/";
			return s;
		}),
	);

const normalizeOptions = (opts) => {
	const o = opts && typeof opts === "object" ? opts : {};
	const list = (v) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
	return {
		catalog: o.catalog || null,
		catalogPath: o.catalogPath || "reports/entities-catalog.json",
		roots: normalizeFolders(o.roots || []),
		include: o.include || [],
		exclude: o.exclude || [],
		debt: o.debt === undefined ? true : o.debt,
		root: typeof o.root === "string" ? o.root : undefined,
		exts: list(o.exts).length ? list(o.exts) : DEFAULTS.exts,
		ignoreDirs: list(o.ignoreDirs).length ? list(o.ignoreDirs) : DEFAULTS.ignoreDirs,
		rootMarkers: list(o.rootMarkers).length ? list(o.rootMarkers) : DEFAULTS.rootMarkers,
	};
};

const isIgnored = (relPath, include, exclude) => {
	const p = relPath.split(path.sep).join("/");
	if (pipe(exclude || [], filter((pat) => minimatch(p, pat)), first) !== undefined) return true;
	if (include && include.length) {
		return !pipe(include, filter((pat) => minimatch(p, pat)), first);
	}
	return false;
};

const findRepoRoot = (startDir, markers) => {
	const list = markers && markers.length ? markers : DEFAULTS.rootMarkers;
	let dir = startDir;
	for (;;) {
		if (list.some((m) => fs.existsSync(path.join(dir, m)))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

const loadRuleOptions = (startDir) => {
	let dir = startDir;
	for (;;) {
		const found = tryLoadIn(dir);
		if (found) return found;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

const tryLoadIn = (dir) => {
	const standalone = path.join(dir, `md-code-${RULE_ID}.config.js`);
	if (fs.existsSync(standalone)) {
		const mod = require(standalone);
		const opts = mod && mod.options !== undefined ? mod.options : mod;
		return { options: opts || {}, source: standalone };
	}

	for (const name of ["eslint.config.js", "eslint.config.mjs"]) {
		const p = path.join(dir, name);
		if (!fs.existsSync(p)) continue;
		try {
			const cfg = require(p);
			const list = Array.isArray(cfg) ? cfg : cfg && typeof cfg === "function" ? cfg({}) : [cfg];
			const hit = pipe(
				list || [],
				filter((entry) => {
					if (!entry || typeof entry !== "object") return false;
					const rules = entry.rules || {};
					return pipe(Object.keys(rules), filter((key) => key === RULE_ID || key.endsWith(`/${RULE_ID}`)), first) !== undefined;
				}),
				first,
			);
			if (hit) {
				const rules = hit.rules || {};
				const key = pipe(Object.keys(rules), filter((k) => k === RULE_ID || k.endsWith(`/${RULE_ID}`)), first);
				const val = rules[key];
				const options = Array.isArray(val) ? val[1] : undefined;
				return { options: options || {}, source: p };
			}
		} catch {}
	}

	for (const name of [".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"]) {
		const p = path.join(dir, name);
		if (!fs.existsSync(p)) continue;
		try {
			const cfg = require(p);
			const rules = (cfg && cfg.rules) || {};
			const key = pipe(Object.keys(rules), filter((k) => k === RULE_ID || k.endsWith(`/${RULE_ID}`)), first);
			if (key) {
				const val = rules[key];
				const options = Array.isArray(val) ? val[1] : undefined;
				return { options: options || {}, source: p };
			}
		} catch {}
	}

	return null;
};

module.exports = { RULE_ID, DEFAULTS, normalizeOptions, normalizeFolders, isIgnored, resolveDataPath, findRepoRoot, loadRuleOptions };

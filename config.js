"use strict";

const path = require("node:path");
const { minimatch } = require("minimatch");
const { findRepoRoot } = require("./debt");

const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/build/**", ".git/**", "**/_medplum/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/*.stories.tsx", "**/*.stories.ts"];

function resolveDataPath(value, root) {
	if (path.isAbsolute(value)) return value;
	const base = root || process.cwd();
	return path.resolve(base, value);
}

function normalizeOptions(opts) {
	const o = opts && typeof opts === "object" ? opts : {};
	const root = findRepoRoot(process.cwd());

	return {
		catalog: o.catalog || null,
		catalogPath: resolveDataPath(o.catalogPath || "reports/entities-catalog.json", root),

		roots: normalizeFolders(o.roots || []),

		include: o.include || [],
		exclude: o.exclude || DEFAULT_EXCLUDE,

		debt: o.debt || null,

		root,
	};
}

function normalizeFolders(folders) {
	return (folders || []).map((f) => {
		const raw = f && typeof f === "object" ? f.path : f;
		let s = String(raw).trim().split(path.sep).join("/");
		while (s.startsWith("./")) s = s.slice(2);
		if (!s.endsWith("/")) s += "/";
		return s;
	});
}

function inFolder(relPath, folders) {
	const p = relPath.split(path.sep).join("/");
	for (const dir of folders) {
		if (p.startsWith(dir) || p === dir.slice(0, -1)) return true;
	}
	return false;
}

function isIgnored(relPath, include, exclude) {
	const p = relPath.split(path.sep).join("/");
	for (const pat of exclude || []) {
		if (minimatch(p, pat)) return true;
	}
	if (include && include.length) {
		return !include.some((pat) => minimatch(p, pat));
	}
	return false;
}

module.exports = {
	normalizeOptions,
	normalizeFolders,
	inFolder,
	isIgnored,
	resolveDataPath,
	DEFAULT_EXCLUDE,
};

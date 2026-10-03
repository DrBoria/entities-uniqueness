"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipe, map, sort, uniqueBy } = require("remeda");

const slimRecord = (rec, repoRoot) => {
	const p = path.isAbsolute(rec.path) && repoRoot ? path.relative(repoRoot, rec.path) : rec.path;
	return { ...rec, path: p.split(path.sep).join("/") };
};

const dedupeAndSort = (records) =>
	pipe(
		records,
		uniqueBy((r) => `${r.path}|${r.line}|${r.name}`),
		sort((a, b) => (a.path !== b.path ? (a.path < b.path ? -1 : 1) : a.line !== b.line ? a.line - b.line : a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
	);

const writeCatalog = (outPath, catalog) => {
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
};

module.exports = { slimRecord, dedupeAndSort, writeCatalog };

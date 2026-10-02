"use strict";

const fs = require("node:fs");
const path = require("node:path");

function slimRecord(rec, repoRoot) {
	const p = path.isAbsolute(rec.path) && repoRoot ? path.relative(repoRoot, rec.path) : rec.path;
	return { ...rec, path: p.split(path.sep).join("/") };
}

function dedupeAndSort(records) {
	const seen = new Set();
	const out = [];
	for (const rec of records) {
		const key = `${rec.path}|${rec.line}|${rec.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(rec);
	}
	out.sort((a, b) => {
		if (a.path !== b.path) return a.path < b.path ? -1 : 1;
		if (a.line !== b.line) return a.line - b.line;
		return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
	});
	return out;
}

function writeCatalog(outPath, catalog) {
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

module.exports = { slimRecord, dedupeAndSort, writeCatalog };

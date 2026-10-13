"use strict";

const fs = require("node:fs");
const path = require("node:path");

const walk = (dir, exts, ignoreDirs) => {
	const extSet = new Set(exts);
	const ignoreSet = new Set(ignoreDirs);
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files = entries.filter((e) => e.isFile() && extSet.has(path.extname(e.name))).map((e) => path.join(dir, e.name));
	const dirs = entries.filter((e) => e.isDirectory() && !ignoreSet.has(e.name) && !e.name.startsWith(".")).map((e) => walk(path.join(dir, e.name), exts, ignoreDirs));

	return [...files, ...dirs.flat()];
};

const relPosix = (repoRoot, abs) => path.relative(repoRoot, abs).split(path.sep).join("/");

const dedupeBy = (items, keyOf) => {
	const seen = new Set();
	const out = [];
	for (const item of items) {
		const key = keyOf(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}

	return out;
};

const writeJson = (outPath, data) => {
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
};

module.exports = { walk, relPosix, dedupeBy, writeJson };

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { filter } = require("remeda");

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);
const CODE_RE = /\.(tsx?|jsx)$/;

const walk = (dir) => {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files = filter(entries, (e) => e.isFile() && CODE_RE.test(e.name)).map((e) => path.join(dir, e.name));
	const dirs = filter(entries, (e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")).map((e) => walk(path.join(dir, e.name)));
	return [...files, ...dirs.flat()];
};

module.exports = { walk };

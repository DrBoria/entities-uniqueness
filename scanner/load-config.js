"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipe, filter, first } = require("remeda");

const RULE_ID = "entities-uniqueness";

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
	const standalone = path.join(dir, "md-code-entities-uniqueness.config.js");
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
		} catch {
		}
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
				const options = Array.isArray(val) ? val[0] : undefined;
				return { options: options || {}, source: p };
			}
		} catch {
		}
	}

	return null;
};

module.exports = { loadRuleOptions };

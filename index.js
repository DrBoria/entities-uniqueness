"use strict";

const path = require("node:path");

const { loadCatalog, RULE_NAME, RULE_SHORT } = require("./config");

const DEFAULT_EXPORT = "reports/entities-catalog.json";

// Severity per tier: duplicates are hard errors, extraction candidates are warnings.
const TIER_SEVERITY = { duplicate: "error", extract: "warn", similar: "off" };

const createRule = () => {
	return {
		meta: {
			type: "problem",
			docs: {
				description: "Flag entities (classes, interfaces, type shapes, stores) that are near-duplicates of another entity in the catalog — they should be declared once.",
			},
			messages: {
				duplicateEntity: "Entity \"{{name}}\" is a near-duplicate of \"{{other}}\" in {{path}} ({{reason}}).",
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
					},
					additionalProperties: false,
				},
			],
		},
		create(context) {
			const options = context.options && context.options[0] ? context.options[0] : {};
			const filename = context.filename || (context.getFilename ? context.getFilename() : "");
			const relPath = path.relative(context.cwd || process.cwd(), filename).split(path.sep).join("/");

			// Inline catalog (rule option) wins over the on-disk catalog.
			let catalog = null;
			if (Array.isArray(options.catalog) && options.catalog.length > 0) {
				catalog = { entities: [], matches: options.catalog };
			} else {
				const exportPath = options.exportPath || DEFAULT_EXPORT;
				catalog = loadCatalog({ root: context.cwd || process.cwd(), exportPath });
			}
			if (!catalog || !Array.isArray(catalog.matches)) return {};

			const matches = catalog.matches;

			return {
				"Program:exit"() {
					for (const m of matches) {
						const sides = [
							{ self: m.a, other: m.b },
							{ self: m.b, other: m.a },
						];
						for (const { self, other } of sides) {
							if (self.sourceFile !== relPath) continue;
							const severity = TIER_SEVERITY[m.tier] || "off";
							if (severity === "off") continue;
							const line = self.line || 1;
							context.report({
								loc: { start: { line, column: 0 }, end: { line, column: 0 } },
								messageId: "duplicateEntity",
								data: { name: self.name, other: other.name, path: other.sourceFile, reason: m.reason || "" },
							});
						}
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

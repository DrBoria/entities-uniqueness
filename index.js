"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pipe, filter, flatMap, first } = require("remeda");
const { normalizeOptions, isIgnored, resolveDataPath } = require("./config");
const { resolveThresholds } = require("./thresholds");
const { applyDebt, loadLedger, findRepoRoot } = require("./debt");
const { extractFromFile } = require("./extract");

const RULE_ID = "entities-uniqueness";

const loadCatalog = (catalogPath) => {
	try {
		const raw = fs.readFileSync(catalogPath, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.entities)) return null;
		return parsed;
	} catch {
		return null;
	}
};

const memberAbsPath = (catalog, member) => {
	const p = member.path || "";
	if (path.isAbsolute(p)) return p;
	const base = catalog.repoRoot ? path.resolve(catalog.repoRoot) : process.cwd();
	return path.resolve(base, p);
};

const findClusterFor = (catalog, rec) => {
	const cluster = pipe(
		catalog.clusters || [],
		filter((c) => pipe(c.members || [], filter((m) => memberAbsPath(catalog, m) === rec.path && m.line === rec.line), first)),
		first,
	);
	if (!cluster) return null;
	return { cluster, canonical: cluster.canonical };
};

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Report duplicate entities (classes, interfaces, object shapes, constructor functions) against a scanned catalog",
			recommended: false,
		},
		messages: {
			duplicateEntity:
				"Duplicate entity: `{{name}}` shares {{shared}} member(s) with `{{canonical}}` in {{canonicalPath}} ({{tier}}). Declare it once and reuse.",
			missingCatalog:
				"Entities catalog not found at {{catalogPath}}. Run the scanner first: `npx md-code-entities-uniqueness --roots <folder>`.",
		},
		schema: [
			{
				type: "object",
				properties: {
					catalog: { type: "string" },
					catalogPath: { type: "string" },
					roots: {
						oneOf: [
							{ type: "string" },
							{
								type: "array",
								items: {
									oneOf: [
										{ type: "string" },
										{
											type: "object",
											properties: { path: { type: "string" } },
											required: ["path"],
										},
									],
								},
							},
						],
					},
					include: { type: "array", items: { type: "string" } },
					exclude: { type: "array", items: { type: "string" } },
					debt: { oneOf: [{ type: "boolean" }, { type: "string" }] },
					root: { type: "string" },
					minMembers: { type: "number" },
					suspiciousMinShared: { type: "number" },
					duplicateMinShared: { type: "number" },
					minOverlapRatio: { type: "number" },
					ignoredMethods: { type: "array", items: { type: "string" } },
					requireExported: { type: "boolean" },
				},
				additionalProperties: false,
			},
		],
	},

	create(rawContext) {
		const context0 = rawContext && rawContext.options !== undefined ? rawContext : { ...rawContext, options: [] };
		const rawOpts = context0.options && context0.options[0];
		const opts = normalizeOptions(rawOpts);
		const thresholds = resolveThresholds(rawOpts);

		const filename = context0.getFilename ? context0.getFilename() : context0.filename;
		const root = opts.root || (filename ? findRepoRoot(path.dirname(filename)) : null) || findRepoRoot(process.cwd());

		const ledgerPath = typeof opts.debt === "string" ? resolveDataPath(opts.debt, root) : path.join(root || process.cwd(), "reports", "lint-debt.json");
		const ledger = opts.debt === false ? {} : loadLedger(ledgerPath);
		const context = applyDebt(context0, ledger, RULE_ID);

		const catalogPath = opts.catalogPath;
		const catalog = loadCatalog(catalogPath);

		return {
			Program(node) {
				if (!filename) return;
				const rel = path.relative(root, filename).split(path.sep).join("/");
				if (isIgnored(rel, opts.include, opts.exclude)) return;

				if (!catalog) {
					context.report({
						node,
						messageId: "missingCatalog",
						data: { catalogPath: path.relative(root, catalogPath).split(path.sep).join("/") },
					});
					return;
				}

				const records = extractFromFile(filename, { requireExported: thresholds.requireExported });
				const hits = pipe(
					records,
					filter((rec) => rec.members.length >= thresholds.minMembers),
					flatMap((rec) => {
						const found = findClusterFor(catalog, rec);
						if (!found) return [];
						const { cluster, canonical } = found;
						const canonicalAbs = memberAbsPath(catalog, canonical);
						if (canonicalAbs === rec.path && canonical.line === rec.line) return [];
						return [{ rec, cluster, canonical, canonicalAbs }];
					}),
				);
				hits.forEach(({ rec, cluster, canonical, canonicalAbs }) => {
					const relCanonical = path.relative(root, canonicalAbs).split(path.sep).join("/");
					context.report({
						node,
						messageId: "duplicateEntity",
						data: {
							name: rec.name,
							shared: (cluster.shared || []).length,
							canonical: canonical.name,
							canonicalPath: `${relCanonical}:${canonical.line}`,
							tier: cluster.tier,
						},
					});
				});
			},
		};
	},
};

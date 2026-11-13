"use strict";

// Assemble the ONE JSON payload the overview renders.
//
// The MODEL states facts only: the two source spans (raw lines), the SEMANTIC
// member links (which name matches which, per signal), the per-signal scores, the
// decision and the CLI block. It computes NO diff, NO character range, NO mark —
// code-diff does all of that in the browser from these facts. The HTML file is
// self-contained: openable from disk, no server, no network, no sidecar files.

const path = require("node:path");
const pkg = require("../../../package.json");
const { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } = require("../../../decision-maker");

const { describeComp } = require("../../errorTypes");
const { findingText } = require("../../cli-report");
const { SIGNALS } = require("../../errorTypes/vocabulary/labels");
const { buildGroups } = require("./groups");
const { buildFolders } = require("./folders");
const source = require("./source");
const { analyze } = require("../../matchers");
const { linksBySignal } = require("./links");
const { KIND } = require("../../../constants");

// A filtered-out pair is informational: the decision panel explains why, and a
// side-by-side of rows a filter has already dismissed would only inflate the page.
const DIFFABLE = new Set([KIND.Duplicate, KIND.Extract, KIND.Similar]);

const abs = (repoRoot, relPath) => (path.isAbsolute(relPath) ? relPath : path.resolve(repoRoot, relPath));

// A span is the raw lines of the file at the numbers the parser reported. The
// view aligns them; the model only reads them.
const spanForPlace = (repoRoot, item) => {
	if (!item || !item.path) return null;
	const span = source.spanOf(abs(repoRoot, item.path), item.line, item.endLine ?? item.line);

	return { name: item.name ?? null, path: item.path, line: item.line ?? span.startLine, startLine: span.startLine, endLine: span.endLine, lines: span.lines.map((l) => l.text), missing: span.missing };
};

const buildPair = ({ finding, repoRoot, candidates, opts }) => {
	const left = spanForPlace(repoRoot, finding.left);
	const right = spanForPlace(repoRoot, finding.right);
	if (!left || !right || left.missing || right.missing) return null;

	const leftEntity = candidates.get(`${finding.left.path}#${finding.left.name}`);
	const rightEntity = candidates.get(`${finding.right?.path}#${finding.right?.name}`);
	const analysis = analyze(leftEntity, rightEntity, opts);
	const links = linksBySignal(analysis);
	const cli = findingText(finding, candidates, opts);

	return {
		findingId: finding.id,
		kind: finding.kind,
		columns: [{ path: finding.left.path }, { path: finding.right?.path }],
		left,
		right,
		// SEMANTIC links per signal: code-diff resolves them into drawn lanes.
		links,
		// The scores behind each tab's legend (no ranges, no rows).
		analysis,
		cli,
	};
};

const countBy = (findings, key) => {
	const map = new Map();
	for (const finding of findings) map.set(finding[key], (map.get(finding[key]) ?? 0) + 1);

	return [...map.entries()].map(([value, count]) => ({ value, count }));
};

const collectOverviewData = ({ comp, repoRoot, config = {}, catalogPath = null, notices = [], generatedAt }) => {
	const findings = comp.findings ?? describeComp(comp);
	const candidates = new Map((comp.entities ?? []).map((entity) => [`${entity.sourceFile}#${entity.name}`, entity]));
	const opts = { ignoredMembers: comp.ignoredMembers ?? config.ignoredMembers ?? [], tuning: comp.tuning ?? config.tuning ?? {} };

	const pairs = [];
	const pairsById = new Map();
	for (const finding of findings) {
		if (!DIFFABLE.has(finding.kind)) continue;
		const pair = buildPair({ finding, repoRoot, candidates, opts });
		if (!pair) continue;
		pairs.push(pair);
		pairsById.set(finding.id, pair.findingId);
	}
	const withPair = findings.map((finding) => ({ ...finding, hasPair: pairsById.has(finding.id) }));
	withPair.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

	const groups = buildGroups(withPair);
	const folders = buildFolders(withPair);
	const folderCount = (node) => 1 + node.children.reduce((sum, child) => sum + folderCount(child), 0);
	const roots = new Set(findings.map((f) => (f.left?.path ?? "").split("/")[0]).filter(Boolean));
	const weights = { ...DEFAULT_WEIGHTS, ...(config.weights ?? {}) };
	const thresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds ?? {}) };

	return {
		meta: {
			tool: pkg.name,
			version: pkg.version,
			repoRoot,
			repoName: path.basename(repoRoot),
			generatedAt: generatedAt ?? new Date().toISOString(),
			catalogPath: catalogPath ? path.relative(repoRoot, catalogPath) : null,
			scanRoots: config.roots ?? [],
			weights,
			thresholds,
			filesScanned: comp.files ?? 0,
			entityCount: comp.entityCount ?? 0,
			roots: [...roots],
			notices,
		},
		stats: {
			findings: withPair.length,
			duplicates: withPair.filter((f) => f.kind === KIND.Duplicate).length,
			extract: withPair.filter((f) => f.kind === KIND.Extract).length,
			similar: withPair.filter((f) => f.kind === KIND.Similar).length,
			clusters: withPair.filter((f) => f.kind === KIND.Cluster).length,
			dropped: withPair.filter((f) => f.kind === KIND.Dropped).length,
			pairs: pairs.length,
			groups: groups.length,
			folders: folderCount(folders),
		},
		byKind: countBy(withPair, "kind"),
		signals: SIGNALS.map((s) => ({ key: s.key, label: s.label, short: s.short, color: s.color, what: s.what })),
		findings: withPair,
		pairs,
		groups,
		folders,
		decisions: { weights, thresholds },
	};
};

module.exports = { collectOverviewData, spanForPlace };

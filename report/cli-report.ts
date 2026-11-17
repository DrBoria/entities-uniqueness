"use strict";

// The terminal / `--report` document. It is a MARKDOWN rendering of the same
// findings the HTML page draws — same ids, same numbers, same repair sentences
// — so a finding can be quoted in a PR description and looked up in the page by
// the id printed next to it.
//
// Layers: the verdicts (duplicate → extract → similar), then cross-file clusters,
// then — when verbose — what a filter explained away and the cataloged entities.
//
// Entities compares all pairs symmetrically ({a, b}); there is no canonical
// folder, so unlike utils there is no app-vs-utils split.

import { describeComp } from "./errorTypes";
import { TIER_LABEL, signalOf } from "./errorTypes/vocabulary/labels";
import { describe as describeMatchers } from "./matchers";
import { KIND, TIER, TONE } from "../constants";
import { takeNotices } from "./notices";

const table = (headers, rows) => {
	const lines = [];
	lines.push(`| ${headers.join(" | ")} |`);
	lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
	for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
	lines.push("");
	return lines;
};

const loc = (p) => (p?.line ? `\`${p.path}:${p.line}\`` : `\`${p?.path ?? "—"}\``);

const renderHeader = (comp, findings) => {
	const count = (kind) => findings.filter((f) => f.kind === kind).length;
	const lines = [];
	lines.push("# Entity similarity report");
	lines.push("");
	lines.push(`Scanned ${comp.files} file(s), found ${comp.entityCount} entit${comp.entityCount === 1 ? "y" : "ies"}.`);
	lines.push("");
	lines.push(
		`Found ${count(KIND.Duplicate)} duplicate pair(s), ${count(KIND.Extract)} extraction candidate pair(s), and ${count(KIND.Similar)} weakly-similar pair(s)` +
			`${(comp.dropped ?? []).length > 0 ? ` (after filtering out ${comp.dropped.length} match(es))` : ""}.`,
	);
	lines.push("");

	return lines;
};

// One row per verdict: the numbers, the top signal and the repair. The id is
// printed IN FULL and unescaped, so it can be pasted into the page's deep link.
const verdictRows = (rows) =>
	rows.map((f) => [
		`\`${f.id}\``,
		`${f.left?.name ?? "—"}`,
		loc(f.left),
		`${f.right?.name ?? "—"}`,
		loc(f.right),
		`${f.confidence != null ? f.confidence.toFixed(2) : "—"}`,
		f.decision ? f.decision.signals.reduce((top, s) => (s.contribution > top.contribution ? s : top), f.decision.signals[0]).label : "—",
		f.fix?.text ?? "",
	]);

// The five explanations the page draws, as markdown: what each signal compared.
// `candidates` is a Map keyed `path#name` → entity, so the matcher models can be
// rebuilt from the same entities the decision used.
const matcherBlocks = (candidates, finding, opts) => {
	const left = candidates.get(`${finding.left?.path}#${finding.left?.name}`);
	const right = candidates.get(`${finding.right?.path}#${finding.right?.name}`);
	if (!left || !right) return [];
	const blocks = describeMatchers(left, right, { ...opts, entities: [...candidates.values()] });
	const lines = [];
	for (const block of blocks) {
		const [first, ...rest] = block.lines;
		lines.push(`  ${signalOf(block.key).label}  ${first}`);
		for (const line of rest) lines.push(`    ${line}`);
	}

	return lines;
};

// ONE finding, ONE block: the verdict sentence, every reason, each matcher's own
// lines, the repair. Both the markdown report and the HTML page print this.
const findingBlock = (f, candidates = new Map(), opts = {}) => {
	const lines = [`- **${f.left?.name ?? "—"}** — ${f.message}`];
	const scores = (f.decision?.signals ?? []).filter((signal) => signal.applied).map((signal) => `${signal.label} ${Math.round(signal.score * 100)}%`);
	if (scores.length > 0) lines.push(`  scores  ${scores.join("  ·  ")}`);
	for (const why of f.decision?.why ?? []) if (why.tone === TONE.Veto) lines.push(`  ! ${why.text}`);
	lines.push(...matcherBlocks(candidates, f, opts));
	lines.push(`  **Fix** — ${f.fix?.text ?? ""}`);

	return lines;
};

// The same block, plus the row the table carries above it: the id, the two names
// with their locations, the confidence and the signal that decided it. This is
// the whole console entry for one finding, as a single string.
const findingText = (f, candidates = new Map(), opts = {}) => {
	const top = f.decision ? f.decision.signals.reduce((best, s) => (s.contribution > best.contribution ? s : best), f.decision.signals[0]) : null;
	const head = [
		`\`${f.id}\``,
		`${f.left?.name ?? "—"}  ${loc(f.left)}  →  ${f.right?.name ?? "—"}  ${loc(f.right)}`,
		`confidence ${f.confidence != null ? f.confidence.toFixed(2) : "—"}${top ? ` · top signal ${top.label}` : ""}`,
		"",
	];

	return [...head, ...findingBlock(f, candidates, opts)].join("\n");
};

const renderTier = (tier, findings, candidates, opts) => {
	const rows = findings.filter((f) => f.tier === tier).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
	if (rows.length === 0) return [];
	const lines = [];
	lines.push(`## ${TIER_LABEL[tier]} (${rows.length})`);
	lines.push("");
	lines.push(...table(["Id", "Entity A", "Location", "Entity B", "Location", "Confidence", "Top signal", "Fix"], verdictRows(rows)));
	lines.push("### Why each one matched");
	lines.push("");
	for (const f of rows) lines.push(...findingBlock(f, candidates, opts));
	lines.push("");

	return lines;
};

const renderClusters = (findings) => {
	const clusters = findings.filter((f) => f.kind === KIND.Cluster);
	if (clusters.length === 0) return [];
	const lines = [`## Cross-file copies (${clusters.length})`, ""];
	for (const f of clusters) {
		lines.push(`### ${(f.members ?? []).map((m) => m.name).join(" · ")}`);
		lines.push("");
		lines.push(f.message);
		lines.push("");
		lines.push(...table(["Entity", "Location", "Kind"], (f.members ?? []).map((m) => [m.name, loc(m), m.kind ?? "—"])));
		lines.push(`**Fix** — ${f.fix?.text ?? ""}`);
		lines.push("");
	}

	return lines;
};

const renderFiltered = (findings) => {
	const dropped = findings.filter((f) => f.kind === KIND.Dropped);
	if (dropped.length === 0) return [];
	return [
		`## Filtered out (${dropped.length})`,
		"",
		...table(
			["Entity A", "Entity B", "Filter", "Why dropped"],
			dropped.map((f) => [f.left?.name ?? "—", f.right?.name ?? "—", `\`${f.dropped?.filter ?? "—"}\``, f.dropped?.reason ?? ""]),
		),
	];
};

// Aliases / inheritance: reuse, not duplication. The page draws them on the
// Inheritance tab; the report lists them so the terminal carries the same fact.
const renderAliases = (findings) => {
	const aliases = findings.filter((f) => f.kind === KIND.Alias);
	if (aliases.length === 0) return [];
	return [
		`## Aliases / inheritance (${aliases.length})`,
		"",
		...table(
			["Entity", "Location", "Reuses", "Location"],
			aliases.map((f) => [f.left?.name ?? "—", loc(f.left), f.right?.name ?? "—", loc(f.right)]),
		),
	];
};

// The duplicate trees and shared-entity candidates the page's Trees view draws.
// The extract list can run into the tens of thousands; the strongest are shown
// and the rest pointed at the catalog, exactly as the page does.
const SHARED_ENTITY_TOP = 50;

const renderTree = (node, depth) => {
	const lines = [];
	const pad = "  ".repeat(depth);
	if (depth === 0) {
		lines.push(`### Duplicates of ${node.entity.name}`);
		lines.push("");
	}
	lines.push(`${pad}- ${node.entity.name} \`${node.entity.sourceFile}:${node.entity.line}\``);
	for (const child of node.children) lines.push(...renderTree(child, depth + 1));

	return lines;
};

const renderTrees = (trees) => {
	if (!trees || (!trees.trees?.length && !trees.extracts?.length)) return [];
	const lines = [];
	if (trees.trees?.length > 0) {
		lines.push(`## Duplicate trees (${trees.trees.length})`);
		lines.push("");
		for (const tree of trees.trees) lines.push(...renderTree(tree, 0));
		lines.push("");
	}
	if (trees.extracts?.length > 0) {
		const top = [...trees.extracts].sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, SHARED_ENTITY_TOP);
		lines.push(`## Shared-entity candidates (${trees.extracts.length})`);
		lines.push("");
		for (const x of top) {
			lines.push(`- **${x.left.name}** \`${x.left.sourceFile}:${x.left.line}\` ↔ **${x.right.name}** \`${x.right.sourceFile}:${x.right.line}\` (${x.score ?? 0})`);
			lines.push(`  - shared: ${x.shared.join(", ") || "–"} — ${x.suggest}`);
		}
		if (trees.extracts.length > top.length) {
			lines.push("");
			lines.push(`_…and ${trees.extracts.length - top.length} more (see the catalog for the full list)._`);
		}
		lines.push("");
	}

	return lines;
};

const renderSuggestions = (suggestions) => {
	if (!suggestions || suggestions.length === 0) return [];
	const lines = [`## Refactor suggestions (${suggestions.length})`, ""];
	for (const s of suggestions) {
		lines.push(`- **${s.type}** — ${s.reason}`);
		lines.push(`  - entities: ${s.entities.join(", ")}`);
		lines.push(`  - members: ${s.members.join(", ") || "–"}`);
	}
	lines.push("");

	return lines;
};

const renderCatalog = (entities) => {
	if (!entities || entities.length === 0) return [];
	const lines = [
		`## Cataloged entities (${entities.length})`,
		"",
		...table(
			["Entity", "Location", "Kind", "Framework", "Exported", "Properties", "Methods"],
			[...entities]
				.sort((a, b) => a.name.localeCompare(b.name) || a.sourceFile.localeCompare(b.sourceFile))
				.map((e) => [e.name, `\`${e.sourceFile}:${e.line}\``, e.kind, e.framework || "–", e.exported ? "yes" : "no", e.properties.length, e.methods.length]),
		),
	];

	return lines;
};

const renderNotices = (notices) => {
	if (!notices.length) return "";
	const lines = ["", `## Not read (${notices.length})`, ""];
	for (const line of notices) lines.push(`- ${line}`);
	lines.push("");

	return lines.join("\n");
};

// `verbose` keeps the filtered-out section and the full catalog. `notices` are
// the caveats the run collected; the caller passes them in so both artifacts show
// the SAME ones. Every tab the page draws has a section here: the verdict tiers
// (with each matcher's own lines), aliases, cross-file clusters, the duplicate
// trees and shared-entity candidates, and the refactor suggestions.
const renderEntityReport = (comp, verbose = false, notices = takeNotices()) => {
	const findings = comp.findings ?? describeComp(comp);
	const candidates = new Map((comp.entities ?? []).map((e) => [`${e.sourceFile}#${e.name}`, e]));
	const opts = { ignoredMembers: comp.ignoredMembers ?? [], tuning: comp.tuning ?? {} };
	const lines = [];
	lines.push(...renderHeader(comp, findings));
	for (const tier of [TIER.Duplicate, TIER.Extract, TIER.Similar]) lines.push(...renderTier(tier, findings, candidates, opts));
	lines.push(...renderAliases(findings));
	lines.push(...renderClusters(findings));
	lines.push(...renderTrees(comp.trees));
	lines.push(...renderSuggestions(comp.suggestions));
	if (verbose) {
		lines.push(...renderFiltered(findings));
		lines.push(...renderCatalog(comp.entities));
	}
	if (notices.length) lines.push(renderNotices(notices));

	return lines.join("\n");
};

export {  renderEntityReport, renderTier, renderNotices, findingBlock, findingText  };

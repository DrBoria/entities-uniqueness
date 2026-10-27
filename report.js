"use strict";

// Markdown report for the entities pipeline.
//
// Shows, in order: header (counts), duplicate tier, extraction-candidate tier,
// similar tier, clusters, refactor suggestions, and — when verbose — the
// filtered-out pairs. Every pair row lists ALL five signal scores, so a
// confidence is always explainable from the report alone.

const TIER_ORDER = ["duplicate", "extract", "similar"];

const TIER_LABEL = {
	duplicate: "High-confidence duplicates (confidence ≥ duplicate threshold)",
	extract: "Strong extraction candidates (extract ≤ confidence < duplicate)",
	similar: "Weak similarity (similar ≤ confidence < extract)",
};

// How many shared-entity (extract) candidates the report lists before it stops
// and points at the catalog for the rest.
const SHARED_ENTITY_TOP = 50;

const signalCell = (d) => {
	const s = d.signals || {};
	// A signal with no evidence for the pair (e.g. both entities have no methods)
	// shows "–" rather than its neutral 1.00, which would look like a real match.
	const fmt = (k) => (s[k] && s[k].hasEvidence !== false ? s[k].score.toFixed(2) : "–");

	return `props ${fmt("properties")} · methods ${fmt("methods")} · sig ${fmt("signature")} · name ${fmt("name")} · inh ${fmt("inheritance")}`;
};

const renderHeader = (r) => {
	const lines = [];
	lines.push("# Entity similarity report");
	lines.push("");
	lines.push(`Scanned ${r.files} file(s), found ${r.entityCount} entit${r.entityCount === 1 ? "y" : "ies"}.`);
	const counts = {};
	for (const t of TIER_ORDER) counts[t] = (r.matches || []).filter((m) => m.tier === t).length;
	lines.push(
		`Found ${counts.duplicate} high-confidence duplicate pair(s), ${counts.extract} strong extraction candidate pair(s), and ${counts.similar} weakly-similar pair(s)` +
			`${r.dropped && r.dropped.length > 0 ? ` (after filtering out ${r.dropped.length} match(es))` : ""}.`
	);
	lines.push("");

	return lines;
};

const renderTierSection = (tier, rows) => {
	const lines = [];
	lines.push(`## ${TIER_LABEL[tier]} (${rows.length})`);
	lines.push("");
	if (rows.length === 0) {
		lines.push("_None._");
		lines.push("");
		return lines;
	}
	lines.push("| Entity A | Location | Entity B | Location | Confidence | Signals | Why |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- |");
	const sorted = [...rows].sort((a, b) => b.decision.confidence - a.decision.confidence || a.a.name.localeCompare(b.a.name));
	for (const m of sorted) {
		const d = m.decision;
		lines.push(`| ${m.a.name} | \`${m.a.sourceFile}:${m.a.line}\` | ${m.b.name} | \`${m.b.sourceFile}:${m.b.line}\` | ${d.confidence.toFixed(2)} | ${signalCell(d)} | ${d.reason} |`);
	}
	lines.push("");

	return lines;
};

const renderClustersSection = (clusters) => {
	if (!clusters || clusters.length === 0) return [];
	const lines = [];
	lines.push(`## Clusters of similar entities (${clusters.length})`);
	lines.push("");
	for (const c of clusters) {
		lines.push(`### ${c.members.map((m) => m.name).join(" · ")} (${c.members.length} entities)`);
		lines.push("");
		lines.push("| Entity | Location | Kind | Framework | Properties | Methods |");
		lines.push("| --- | --- | --- | --- | --- | --- |");
		for (const m of c.members) {
			lines.push(`| ${m.name} | \`${m.sourceFile}:${m.line}\` | ${m.kind} | ${m.framework || "–"} | ${m.properties.length} | ${m.methods.length} |`);
		}
		lines.push("");
	}

	return lines;
};

const renderSuggestionsSection = (suggestions) => {
	if (!suggestions || suggestions.length === 0) return [];
	const lines = [];
	lines.push(`## Refactor suggestions (${suggestions.length})`);
	lines.push("");
	for (const s of suggestions) {
		lines.push(`- **${s.type}** — ${s.reason}`);
		lines.push(`  - entities: ${s.entities.join(", ")}`);
		lines.push(`  - members: ${s.members.join(", ") || "–"}`);
	}
	lines.push("");

	return lines;
};

const renderFilteredSection = (dropped) => {
	if (!dropped || dropped.length === 0) return [];
	const lines = [];
	lines.push(`## Filtered out (${dropped.length})`);
	lines.push("");
	lines.push("| Entity A | Entity B | Filter | Why dropped |");
	lines.push("| --- | --- | --- | --- |");
	const sorted = [...dropped].sort((a, b) => a.filter.localeCompare(b.filter) || a.a.name.localeCompare(b.a.name));
	for (const d of sorted) {
		lines.push(`| ${d.a.name} | ${d.b.name} | ${d.filter} | ${d.reason} |`);
	}
	lines.push("");

	return lines;
};

const renderEntitySection = (entities) => {
	if (!entities || entities.length === 0) return [];
	const lines = [];
	lines.push(`## Cataloged entities (${entities.length})`);
	lines.push("");
	lines.push("| Entity | Location | Kind | Framework | Exported | Properties | Methods |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- |");
	const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name) || a.sourceFile.localeCompare(b.sourceFile));
	for (const e of sorted) {
		lines.push(`| ${e.name} | \`${e.sourceFile}:${e.line}\` | ${e.kind} | ${e.framework || "–"} | ${e.exported ? "yes" : "no"} | ${e.properties.length} | ${e.methods.length} |`);
	}
	lines.push("");

	return lines;
};

const renderTree = (node, depth) => {
	const lines = [];
	const pad = "  ".repeat(depth);
	const loc = `${node.entity.sourceFile}:${node.entity.line}`;
	if (depth === 0) {
		lines.push(`### Duplicates of ${node.entity.name}`);
		lines.push("");
	}
	lines.push(`${pad}- ${node.entity.name} \`${loc}\``);
	for (const child of node.children) lines.push(...renderTree(child, depth + 1));

	return lines;
};

const renderTreesSection = (trees) => {
	if (!trees || (!trees.trees.length && !trees.extracts.length)) return [];
	const lines = [];
	if (trees.trees.length > 0) {
		lines.push(`## Duplicate trees (${trees.trees.length})`);
		lines.push("");
		for (const tree of trees.trees) lines.push(...renderTree(tree, 0));
		lines.push("");
	}
	if (trees.extracts.length > 0) {
		// The full extract list can run into the tens of thousands; dumping it
		// all makes the report unreadable. Show the strongest (by score) and
		// note how many more were left out — the full list stays in the catalog.
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

const renderEntityReport = (r) => {
	const lines = [];
	lines.push(...renderHeader(r));
	lines.push(...renderTreesSection(r.trees));
	for (const tier of TIER_ORDER) {
		const rows = (r.matches || []).filter((m) => m.tier === tier);
		lines.push(...renderTierSection(tier, rows));
	}
	lines.push(...renderClustersSection(r.clusters));
	lines.push(...renderSuggestionsSection(r.suggestions));
	if (r.verbose) {
		lines.push(...renderFilteredSection(r.dropped));
		lines.push(...renderEntitySection(r.entities));
	}

	return lines.join("\n");
};

module.exports = { renderEntityReport, TIER_ORDER, TIER_LABEL };

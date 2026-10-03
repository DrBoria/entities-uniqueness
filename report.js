"use strict";

const path = require("node:path");
const { pipe, reduce } = require("remeda");

const rel = (p, repoRoot) => {
	const norm = p.split(path.sep).join("/");
	const root = repoRoot.split(path.sep).join("/");
	return norm.startsWith(root + "/") ? norm.slice(root.length + 1) : norm;
};

const renderDuplicateReport = ({ clusters, repoRoot, roots }) => {
	const byTier = { duplicate: [], suspicious: [] };
	pipe(
		clusters,
		reduce(
			(acc, c) => {
				(acc[c.tier] || acc.suspicious).push(c);
				return acc;
			},
			byTier,
		),
	);

	const lines = [
		"# Duplicate entities",
		"",
		`Scanned ${roots.map((r) => `\`${r}\``).join(", ")}. Found ${clusters.length} duplicate cluster(s).`,
		"",
		"An entity is a class, interface, object-literal shape, or constructor function whose member set overlaps another entity's. Duplicates should be declared once and shared.",
		"",
	];

	const section = (title, list, why) => {
		if (!list.length) return;
		lines.push(`## ${title} (${list.length})`, "", why, "");
		for (const c of list) {
			lines.push(`### \`${c.canonical.name}\` (${c.canonical.kind}) — \`${rel(c.canonical.path, repoRoot)}:${c.canonical.line}\``, "");
			lines.push(`shared members: \`${(c.shared || []).join(", ")}\``, "");
			lines.push("| Duplicate | Kind | Location | Members |", "| --- | --- | --- | --- |");
			for (const m of c.members) {
				lines.push(`| ${m.name} | ${m.kind} | \`${rel(m.path, repoRoot)}:${m.line}\` | ${m.members.length} |`);
			}
			lines.push("");
		}
	};

	section("Definite duplicates", byTier.duplicate, "5+ shared members — the same entity declared in several places; extract one canonical declaration");
	section("Suspicious overlap", byTier.suspicious, "3–4 shared members — likely the same entity; review and merge");

	return lines.join("\n");
};

module.exports = { renderDuplicateReport };

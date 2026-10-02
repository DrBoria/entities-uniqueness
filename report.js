"use strict";

function renderDuplicateReport({ clusters, repoRoot, roots }) {
	const lines = [];
	lines.push("# Duplicate entities");
	lines.push("");
	lines.push(`Scanned ${roots.map((r) => `\`${r}\``).join(", ")}. Found ${clusters.length} duplicate cluster(s).`);
	lines.push("");
	lines.push("An entity is a class, interface, object-literal shape, or constructor function whose member set overlaps another entity's. Duplicates should be declared once and shared.");
	lines.push("");

	const byTier = { duplicate: [], suspicious: [] };
	for (const c of clusters) {
		(byTier[c.tier] || byTier.suspicious).push(c);
	}

	const rel = (p) => {
		const n = p.split("\\").join("/");
		const root = repoRoot.split("\\").join("/");
		return repoRoot && n.startsWith(root) ? n.slice(root.length + 1) : n;
	};

	const section = (title, list, why) => {
		if (list.length === 0) return;
		lines.push(`## ${title} (${list.length})`);
		lines.push("");
		lines.push(why);
		lines.push("");
		for (const c of list) {
			const canonLoc = `${rel(c.canonical.path)}:${c.canonical.line}`;
			lines.push(`### \`${c.canonical.name}\` (${c.canonical.kind}) — \`${canonLoc}\``);
			lines.push("");
			lines.push(`shared members: \`${(c.shared || []).join(", ")}\``);
			lines.push("");
			lines.push("| Duplicate | Kind | Location | Members |");
			lines.push("| --- | --- | --- | --- |");
			for (const m of c.members) {
				const row = `| ${m.name} | ${m.kind} | \`${rel(m.path)}:${m.line}\` | ${m.members.length} |`;
				lines.push(row);
			}
			lines.push("");
		}
	};

	section("Definite duplicates", byTier.duplicate, "5+ shared members — the same entity declared in several places; extract one canonical declaration");
	section("Suspicious overlap", byTier.suspicious, "3–4 shared members — likely the same entity; review and merge");

	return lines.join("\n");
}

module.exports = { renderDuplicateReport };

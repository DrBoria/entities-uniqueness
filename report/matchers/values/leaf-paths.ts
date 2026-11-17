"use strict";

// Leaf paths of ONE value tree: `rollout.regions[0]`, `limits.burst`, …
// Shared by the Values model (row per leaf) and the Values links (the anchor
// line of each leaf), so a row and its ribbon always name the same path.

const walkLeaves = (node, prefix, out) => {
	if (node == null || typeof node !== "object") return out;
	if (node.kind === "primitive" || node.kind === "opaque") {
		out.push({ path: prefix, text: node.kind === "primitive" ? String(node.value) : String(node.text) });

		return out;
	}
	if (node.kind === "function") {
		out.push({ path: prefix, text: "ƒ" });

		return out;
	}
	if (node.kind === "array") {
		(node.items || []).forEach((item, i) => walkLeaves(item, `${prefix}[${i}]`, out));

		return out;
	}
	if (node.kind === "object") {
		for (const [key, value] of Object.entries(node.entries || {})) walkLeaves(value, prefix ? `${prefix}.${key}` : key, out);
	}

	return out;
};

/** Every leaf of one tree as `{ path, text }`, in declaration order. */
const leavesOf = (tree) => (tree == null ? [] : walkLeaves(tree, "", []));

/** The value as written in source: strip the normalizer's kind prefix. */
const sourceText = (text) => String(text ?? "").replace(/^[snb]:/, "");

export { leavesOf, sourceText };
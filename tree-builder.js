"use strict";

// A deliberately dumb assembler. It takes the decision-maker's facts and does
// exactly two things, with no scoring and no judgement of its own:
//
//   1. inclusion facts  -> a forest. Each child is attached to its *tightest*
//      parent (the smallest parent that still contains it), so the tree nests by
//      specificity; the biggest entity of each connected group ends up at the root.
//   2. extract facts     -> a flat list, kept next to the trees for the report.

const buildTrees = (facts, entities) => {
	const byId = new Map((entities || []).map((e) => [e.id, e]));
	const sizeOf = (e) => (e && e.properties ? e.properties.length : 0);

	// childId -> Set<parentId> from the inclusion facts.
	const childrenOf = new Map();
	for (const f of facts || []) {
		if (f.type !== "inclusion") continue;
		if (!childrenOf.has(f.child.id)) childrenOf.set(f.child.id, new Set());
		childrenOf.get(f.child.id).add(f.parent.id);
	}

	// Pick each child's tightest parent so the hierarchy nests by specificity.
	const selectedParent = new Map();
	for (const [childId, parents] of childrenOf) {
		let best = null;
		for (const pid of parents) {
			const p = byId.get(pid);
			if (!p) continue;
			if (best === null || sizeOf(p) < sizeOf(byId.get(best))) best = pid;
		}
		if (best !== null) selectedParent.set(childId, best);
	}

	// Roots: entities that are a parent but never selected as someone's child.
	const parentIds = new Set();
	for (const f of facts || []) if (f.type === "inclusion") parentIds.add(f.parent.id);
	const rootIds = [...parentIds].filter((id) => !selectedParent.has(id));

	const buildNode = (id) => {
		const entity = byId.get(id);
		const children = [];
		for (const [childId, pid] of selectedParent) if (pid === id) children.push(buildNode(childId));
		children.sort((x, y) => x.entity.name.localeCompare(y.entity.name));

		return { entity, children };
	};

	// A root whose only children all attach to a *tighter* parent is left
	// childless — it has no duplicates of its own, so it is not a "duplicate
	// tree" and is dropped rather than rendered as a single misleading node.
	const trees = rootIds
		.map((id) => buildNode(id))
		.filter((t) => t.children.length > 0)
		.sort((x, y) => y.entity.name.localeCompare(x.entity.name));
	const extracts = (facts || []).filter((f) => f.type === "extract");

	return { trees, extracts };
};

module.exports = { buildTrees };

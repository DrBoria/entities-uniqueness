import { describe, expect, it } from "vitest";
import { clusterMatches } from "../matcher/cluster.js";

// Entities and matches are shaped like the pipeline output: clusterMatches only
// reads a.id, a.name, b.id, b.name and decision.confidence.
const ent = (name: string) => ({ id: `x:${name}`, name });
const match = (a: string, b: string, confidence: number) => ({
	a: ent(a),
	b: ent(b),
	tier: confidence >= 0.85 ? "duplicate" : "extract",
	decision: { confidence },
});

describe("clusterMatches link floor", () => {
	it("does not chain a weak extract link into a cluster", () => {
		// A and B are genuinely similar; B and C are only weakly similar
		// (just over the extract threshold). Without a link floor, C is
		// chained into the A–B cluster through B.
		const matches = [match("A", "B", 0.9), match("B", "C", 0.56)];
		const clusters = clusterMatches(matches);

		const withC = clusters.find((c) => c.members.some((m) => m.name === "C"));
		expect(withC).toBeUndefined();
		const ab = clusters.find((c) => c.members.some((m) => m.name === "A"));
		expect(ab).toBeTruthy();
		expect(ab!.members.map((m) => m.name).sort()).toEqual(["A", "B"]);
	});

	it("does not let a whole chain of weak links form one mega cluster", () => {
		// A chain of six entities where every link sits at the bottom of the
		// extract band. Connected components over all of them produces one
		// 6-member cluster; with a link floor each link is too weak to count.
		const names = ["E1", "E2", "E3", "E4", "E5", "E6"];
		const matches = names.slice(0, -1).map((n, i) => match(n, names[i + 1], 0.55));
		const clusters = clusterMatches(matches);

		expect(clusters).toHaveLength(0);
	});

	it("keeps strong links clustered regardless of the floor", () => {
		const matches = [match("A", "B", 0.97), match("B", "C", 0.88)];
		const clusters = clusterMatches(matches);

		expect(clusters).toHaveLength(1);
		expect(clusters[0].members.map((m) => m.name).sort()).toEqual(["A", "B", "C"]);
	});

	it("respects a custom link floor from options", () => {
		// With a stricter floor, even a 0.72 link is too weak.
		const matches = [match("A", "B", 0.9), match("B", "C", 0.72)];
		const clusters = clusterMatches(matches, { clusterFloor: 0.8 });

		expect(clusters).toHaveLength(1);
		expect(clusters[0].members.map((m) => m.name).sort()).toEqual(["A", "B"]);
	});
});

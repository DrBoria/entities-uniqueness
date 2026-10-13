import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { suggest } = require("../suggester.js");

// Build a synthetic entity member with the shape the suggester consumes.
// A shared method is included so the cluster bypasses the shared-type branch
// (which `continue`s on 0 shared methods) and actually reaches the subset rule.
const ent = (name, props, methods = ["render"]) => ({
	name,
	kind: "interface",
	properties: props.map((n) => ({ name: n, type: "value" })),
	methods: methods.map((n) => ({ name: n })),
});

const subsets = (suggestions) => suggestions.filter((s) => s.type === "subset-extraction");
const sharedTypes = (suggestions) => suggestions.filter((s) => s.type === "shared-type");

describe("shared-type suggestion quality floor", () => {
	it("does NOT suggest a shared type from a single common field", () => {
		// LoginOptions / LogoutOptions / StatusOptions all have a lone `verbose`
		// flag. "Extract a shared type for the common fields" on ONE field is
		// noise — a single field is not a type worth extracting.
		const cluster = {
			members: [
				ent("LoginOptions", ["verbose", "user"], []),
				ent("LogoutOptions", ["verbose", "token"], []),
				ent("StatusOptions", ["verbose", "code"], []),
			],
		};
		expect(sharedTypes(suggest([cluster]))).toHaveLength(0);
	});

	it("still suggests a shared type from two or more common fields", () => {
		// AnOption / FilterPillOption / TabsOverflowItem all carry {value, label}
		// — a genuine, reusable option shape.
		const cluster = {
			members: [
				ent("AnOption", ["value", "label"], []),
				ent("FilterPillOption", ["value", "label"], []),
				ent("TabsOverflowItem", ["value", "label"], []),
			],
		};
		const found = sharedTypes(suggest([cluster]));
		expect(found).toHaveLength(1);
		expect(found[0].members).toEqual(["value", "label"]);
	});
});

describe("subset-extraction suggestion quality floor", () => {
	it("does NOT suggest extracting a single-boilerplate-field type as a subset", () => {
		// LinearIssueDemoProps is just {className} — extracting it "into its own
		// type" is noise, not a refactor. A 1-field entity must never be a subset.
		const cluster = {
			members: [ent("LinearIssueDemoProps", ["className"]), ent("SimpleCardProps", ["className", "title", "description", "children"])],
		};
		expect(subsets(suggest([cluster]))).toHaveLength(0);
	});

	it("does NOT suggest a 2-field boilerplate subset (children/className)", () => {
		// AnimatedTextProps {children, className} ⊂ ScrollButtonProps — both fields
		// are universal component boilerplate, so the extraction is still noise.
		const cluster = {
			members: [ent("AnimatedTextProps", ["children", "className"]), ent("ScrollButtonProps", ["targetId", "children", "className", "onClick"])],
		};
		expect(subsets(suggest([cluster]))).toHaveLength(0);
	});

	it("still suggests a meaningful multi-field subset", () => {
		// HistoryCancelled {type,taskId,requestId} ⊂ HistoryChunk — a real, useful
		// extraction (3+ distinct fields).
		const cluster = {
			members: [ent("HistoryCancelled", ["type", "taskId", "requestId"]), ent("HistoryChunk", ["type", "taskId", "requestId", "chunkIndex", "items"])],
		};
		const found = subsets(suggest([cluster]));
		expect(found).toHaveLength(1);
		expect(found[0].entities).toEqual(["HistoryCancelled", "HistoryChunk"]);
	});

	it("does NOT repeat the same subset-extraction when the pair appears in several clusters", () => {
		// The same HistoryCancelled ⊂ HistoryChunk pair legitimately lands in more
		// than one cluster (transitive linking). Suggesting the extraction twice is
		// pure noise — one suggestion per (subset, superset) pair.
		const pair = [ent("HistoryCancelled", ["type", "taskId", "requestId"]), ent("HistoryChunk", ["type", "taskId", "requestId", "chunkIndex", "items"])];
		// Unrelated carries no subset relationship to the pair, so each cluster
		// contributes exactly the one HistoryCancelled ⊂ HistoryChunk suggestion.
		const unrelated = ent("Unrelated", ["alpha", "beta", "gamma", "delta"]);
		const clusters = [{ members: [...pair] }, { members: [...pair, unrelated] }];
		const found = subsets(suggest(clusters));
		expect(found).toHaveLength(1);
	});
});

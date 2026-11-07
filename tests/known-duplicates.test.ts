import { afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { rules } = require("../index.js");
const rule = rules["entities-uniqueness"];

// The same shape, three times, in three sibling folders. Identical members make
// the pair a hard `duplicate` (not an `extract` suggestion), so a test either
// sees the finding or does not.
const SHAPE = [
	"export interface DupShape {",
	"  alpha: number;",
	"  beta: string;",
	"  gamma: boolean;",
	"}",
	"",
].join("\n");

const makeRoot = (files: Record<string, string>): string => {
	const root = mkdtempSync(path.join(os.tmpdir(), "eu-known-dups-"));
	for (const [rel, text] of Object.entries(files)) {
		const abs = path.join(root, rel);
		mkdirSync(path.dirname(abs), { recursive: true });
		writeFileSync(abs, text, "utf8");
	}

	return root;
};

const roots: string[] = [];
const rootWith = (files: Record<string, string>): string => {
	const root = makeRoot(files);
	roots.push(root);

	return root;
};

// The rule's create() only reads sourceCode.text, filename, options, cwd and
// report — enough to drive the real pipeline (catalog refresh + live matches)
// without an ESLint installation in this package.
const findingsFor = (root: string, relPath: string, options: Record<string, unknown>) => {
	const reports: Array<{ messageId: string; data: Record<string, string> }> = [];
	const context = {
		options: [options],
		filename: path.join(root, relPath),
		cwd: root,
		sourceCode: { text: SHAPE },
		report: (descriptor: { messageId: string; data: Record<string, string> }) => reports.push(descriptor),
	};
	const visitors = rule.create(context);
	visitors["Program:exit"]();

	return reports;
};

const PAIR_OF_TWO = {
	"packages/a/one.ts": SHAPE,
	"packages/b/two.ts": SHAPE,
};

const THREE_FOLDERS = {
	...PAIR_OF_TWO,
	"packages/c/three.ts": SHAPE,
};

const A_B = [["packages/a/**", "packages/b/**"]];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("knownDuplicates", () => {
	it("reports the duplicate when no pair is declared", () => {
		const root = rootWith(PAIR_OF_TWO);
		const findings = findingsFor(root, "packages/a/one.ts", { root, roots: ["packages"] });

		expect(findings).toHaveLength(1);
		expect(findings[0].messageId).toBe("duplicateEntity");
		expect(findings[0].data.path).toBe("packages/b/two.ts");
	});

	it("silences the pair it declares — in both directions", () => {
		const root = rootWith(PAIR_OF_TWO);
		const options = { root, roots: ["packages"], knownDuplicates: A_B };

		expect(findingsFor(root, "packages/a/one.ts", options)).toHaveLength(0);
		expect(findingsFor(root, "packages/b/two.ts", options)).toHaveLength(0);
	});

	it("still reports a declared folder against a place that is not in the pair", () => {
		const root = rootWith(THREE_FOLDERS);
		const options = { root, roots: ["packages"], knownDuplicates: A_B };

		// `c` duplicates both `a` and `b`; only the a↔b pair is excused, so `c`
		// must still be flagged.
		const fromC = findingsFor(root, "packages/c/three.ts", options);
		expect(fromC).toHaveLength(1);
		expect(fromC[0].messageId).toBe("duplicateEntity");
		expect(fromC[0].data.path).toMatch(/^packages\/[ab]\//);

		// And `a` is still flagged — by `c`, never by its excused twin `b`.
		const fromA = findingsFor(root, "packages/a/one.ts", options);
		expect(fromA).toHaveLength(1);
		expect(fromA[0].data.path).toBe("packages/c/three.ts");
	});

	it("keeps the untouched pair reported when another pair joins the list", () => {
		const root = rootWith(THREE_FOLDERS);
		const options = {
			root,
			roots: ["packages"],
			knownDuplicates: [
				["packages/a/**", "packages/b/**"],
				["packages/c/**", "packages/elsewhere/**"],
			],
		};

		// a↔b is excused, but `c` is still an outsider to that pair — and `c` is
		// only excused against `packages/elsewhere`, which has no files here.
		const fromA = findingsFor(root, "packages/a/one.ts", options);
		expect(fromA).toHaveLength(1);
		expect(fromA[0].data.path).toBe("packages/c/three.ts");

		const fromC = findingsFor(root, "packages/c/three.ts", options);
		expect(fromC).toHaveLength(1);
		expect(fromC[0].data.path).toMatch(/^packages\/[ab]\//);
	});

	it("does not excuse a pair that is not in the list", () => {
		const root = rootWith(THREE_FOLDERS);
		const options = { root, roots: ["packages"], knownDuplicates: A_B };

		const fromB = findingsFor(root, "packages/b/two.ts", options);

		expect(fromB).toHaveLength(1);
		expect(fromB[0].data.path).toBe("packages/c/three.ts");
	});

	it("accepts exact file paths, not only folders", () => {
		const root = rootWith(PAIR_OF_TWO);
		const options = {
			root,
			roots: ["packages"],
			knownDuplicates: [["packages/a/one.ts", "packages/b/two.ts"]],
		};

		expect(findingsFor(root, "packages/a/one.ts", options)).toHaveLength(0);
		expect(findingsFor(root, "packages/b/two.ts", options)).toHaveLength(0);
	});

	it("exact file paths excuse only those two files", () => {
		const root = rootWith(THREE_FOLDERS);
		const options = {
			root,
			roots: ["packages"],
			knownDuplicates: [["packages/a/one.ts", "packages/b/two.ts"]],
		};

		// The pair is excused, but `c/three.ts` is not part of it.
		const fromA = findingsFor(root, "packages/a/one.ts", options);
		expect(fromA).toHaveLength(1);
		expect(fromA[0].data.path).toBe("packages/c/three.ts");
	});

	it("excuses each listed pair without making the group transitive", () => {
		// Three known groups over five folders: a-b, b-d, j-k. Inside a group the
		// pair is excused, but a-b plus b-d does NOT excuse a-d — the groups are
		// pairs, not a union.
		const folders = ["a", "b", "d", "j", "k"];
		const files: Record<string, string> = {};
		for (const folder of folders) files[`packages/${folder}/x.ts`] = SHAPE;
		const root = rootWith(files);
		const options = {
			root,
			roots: ["packages"],
			knownDuplicates: [
				["packages/a/**", "packages/b/**"],
				["packages/b/**", "packages/d/**"],
				["packages/j/**", "packages/k/**"],
			],
		};

		// a's only excused partner is b, so what remains is d.
		const fromA = findingsFor(root, "packages/a/x.ts", options);
		expect(fromA).toHaveLength(1);
		expect(fromA[0].data.path).toBe("packages/d/x.ts");

		// b is excused from a and d; it is still reported against j or k.
		const fromB = findingsFor(root, "packages/b/x.ts", options);
		expect(fromB).toHaveLength(1);
		expect(fromB[0].data.path).toMatch(/^packages\/[jk]\//);

		// d is excused from b only.
		const fromD = findingsFor(root, "packages/d/x.ts", options);
		expect(fromD).toHaveLength(1);
		expect(fromD[0].data.path).toBe("packages/a/x.ts");

		// j and k are excused from each other, nothing else.
		expect(findingsFor(root, "packages/j/x.ts", options)).toHaveLength(1);
		expect(findingsFor(root, "packages/k/x.ts", options)).toHaveLength(1);
	});

	it("works with many pairs, not just a couple", () => {
		const root = rootWith(PAIR_OF_TWO);
		const noise = Array.from({ length: 200 }, (_unused, index) => [
			`packages/noise-${index}/**`,
			`packages/noise-${index}-twin/**`,
		]);
		const options = {
			root,
			roots: ["packages"],
			knownDuplicates: [[ "packages/a/**", "packages/b/**" ], ...noise],
		};

		expect(findingsFor(root, "packages/a/one.ts", options)).toHaveLength(0);
		expect(findingsFor(root, "packages/b/two.ts", options)).toHaveLength(0);
	});
});

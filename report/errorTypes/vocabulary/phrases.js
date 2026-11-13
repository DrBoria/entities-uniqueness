"use strict";

// Every sentence the report prints about a verdict lives here, as a template
// with `{placeholders}`. A producer states the FACTS (names, paths, numbers);
// the wording is chosen here, once, so the terminal report and the HTML page
// cannot drift apart, and a new sentence is a one-line addition instead of a
// string buried in a renderer.

const fill = (template, vars) =>
	String(template).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, key) =>
		vars[key] != null ? String(vars[key]) : `{${key}}`,
	);

const PHRASES = {
	// ── Verdicts ────────────────────────────────────────────────────────────
	duplicate: "{left} repeats {right} — {confidence} confidence that these are the same shape.",
	extract: "{left} and {right} share a large part of their shape — {confidence}. A shared type is worth extracting.",
	similar: "{left} looks like {right}, but not closely enough to call it a copy — {confidence}.",
	cluster: "{count} entities describe the same shape across files. Nothing shared exists yet, so the fix is one shared type — weakest link {confidence}.",
	inclusion: "{child} is contained in {parent} — {confidence}. The smaller shape can reuse the larger one.",

	// ── Why it matched ──────────────────────────────────────────────────────
	headline: "{confidence} confidence — {top} contributes {share} of it.",
	signal: "{label} agrees at {score} ({weight} of the verdict) — it compares {what}.",
	signalDisagrees: "{label} agrees only at {score} ({weight} of the verdict) — it compares {what}.",
	signalOff: "{label} has no evidence for this pair, its weight was redistributed.",

	// ── Fast-path explanations (entities has no vetoes) ─────────────────────
	fastValueSet: "Both are the same set of literal values — treated as a duplicate.",
	fastAlias: "{left} is an alias of {right} — treated as a duplicate.",
	fastStoreCopy: "{left} mirrors the store model {right} — a generated copy of the same shape.",
	fastIdentical: "The two shapes are identical (every shared property agrees in type) — treated as a duplicate.",
	vetoFloor: "Confidence {confidence} is under the {threshold} floor for the tier.",

	// ── The number itself ───────────────────────────────────────────────────
	confidence: "confidence {confidence} ({signals})",

	// ── Why a pair was dismissed (the filters) ──────────────────────────────
	filtered: "{left} and {right} were filtered out — {reason}",

	// ── Repairs ─────────────────────────────────────────────────────────────
	fixUseShared: "Replace `{left}` with `{right}` from `{path}` — they are the same shape.",
	fixExtractType: "Extract a shared type for {members} and have both `{left}` and `{right}` use it.",
	fixMerge: "Merge `{left}` and `{right}` into one entity.",
	fixKeep: "No action needed beyond the note.",

	// ── Caveats ─────────────────────────────────────────────────────────────
	notRead: "{path} was not read: {reason}",
	noCatalog: "No catalog at {path} — only live pairs were compared.",
};

module.exports = { PHRASES, fill };

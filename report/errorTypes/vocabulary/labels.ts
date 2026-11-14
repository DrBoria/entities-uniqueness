"use strict";

import { SIGNAL, KIND, TIER } from "../../../constants";

// The words the report uses for the five comparison groups. A signal is named
// once here and read back by the terminal report, the HTML page and the log, so
// "properties 1.00" in a message and the blue bar in the picture are the same
// thing. The colour is the ONE colour of that signal everywhere: legend, bar,
// highlighted row, evidence chip.
//
// There is no separate "Name" group: a name is part of a SIGNATURE, so the entity
// name is compared and shown inside the Signature group.

const SIGNALS = [
	{
		key: SIGNAL.Properties,
		label: "Properties",
		short: "props",
		color: "#6ea8fe",
		what: "the set of property names and their types",
	},
	{
		key: SIGNAL.Methods,
		label: "Methods",
		short: "methods",
		color: "#f0a35e",
		what: "the set of method names",
	},
	{
		key: SIGNAL.Signature,
		label: "Signature",
		short: "sig",
		color: "#b48ef0",
		what: "the entity name and the method parameters / return types",
	},
	{
		key: SIGNAL.Values,
		label: "Values",
		short: "vals",
		color: "#56c8a8",
		what: "the values the entity stands for, deep-compared (a renamed copy)",
	},
	{
		key: SIGNAL.Inheritance,
		label: "Inheritance",
		short: "inh",
		color: "#ffd166",
		what: "the shared extends / implements bases, and aliases",
	},
];

const SIGNAL_KEYS = SIGNALS.map((s) => s.key);

const signalOf = (key) => SIGNALS.find((s) => s.key === key) ?? SIGNALS[0];

const signalColor = (key) => signalOf(key).color;

// What each KIND of finding is, what colour it has, and what the reader is
// asked to do about it. `action` is the verb of the repair, not the sentence.
const KINDS = {
	[KIND.Duplicate]: { label: "Duplicate", color: "#ff6b6b", action: "use the shared type" },
	[KIND.Extract]: { label: "Extraction candidate", color: "#f0a35e", action: "extract a shared type" },
	[KIND.Similar]: { label: "Similar", color: "#fbbf24", action: "consider unifying" },
	[KIND.Cluster]: { label: "Cross-file copies", color: "#ffd166", action: "extract one shared type" },
	[KIND.Inclusion]: { label: "Contained shape", color: "#7fdbca", action: "reuse the larger type" },
	[KIND.Alias]: { label: "Alias / inheritance", color: "#9aa7ff", action: "reuse the target — already shared" },
	[KIND.Dropped]: { label: "Filtered out", color: "#6b7788", action: "none — a filter explained it away" },
	unreadable: { label: "Not read", color: "#6b7788", action: "nothing — the file was skipped" },
};

const kindOf = (key) => KINDS[key] ?? KINDS[KIND.Similar];

// The same kinds as a COUNTABLE list (a tile says "Duplicates: 130"). Plural on
// purpose; the colour still comes from KINDS above.
const KIND_TILES = Object.freeze([
	{ key: KIND.Duplicate, label: "Duplicates" },
	{ key: KIND.Extract, label: "Extraction candidates" },
	{ key: KIND.Similar, label: "Similar" },
	{ key: KIND.Cluster, label: "Cross-file copies" },
	{ key: KIND.Inclusion, label: "Contained shapes" },
	{ key: KIND.Alias, label: "Aliases / inheritance" },
	{ key: KIND.Dropped, label: "Filtered out" },
]);

const TIER_LABEL = {
	[TIER.Duplicate]: "High-confidence duplicates (confidence ≥ duplicate threshold)",
	[TIER.Extract]: "Strong extraction candidates (extract ≤ confidence < duplicate)",
	[TIER.Similar]: "Weak similarity (similar ≤ confidence < extract)",
	none: "Below every threshold",
};

export {  SIGNALS, SIGNAL_KEYS, signalOf, signalColor, KINDS, kindOf, KIND_TILES, TIER_LABEL  };

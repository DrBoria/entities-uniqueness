"use strict";

// The ONE vocabulary of the entities report. Every word the tool says — a
// signal name, a verdict, a repair verb, a diff-row kind — is written here once
// and read back by the terminal report, the HTML page and the log, so
// "properties 1.00" in a message and the blue bar in the picture are the same
// thing. The engine (matcher, decision-maker) keeps its own numeric knobs in
// `tuning.js`; this file is only the WORDS and the generic diff limits.

// ═══ 1. The five comparison signals ═════════════════════════════════════════
// Entities are compared as OBJECTS/TYPES, not functions: the shape (properties),
// the behaviour (methods), the call signatures, the name, and the heritage.
const SIGNAL = Object.freeze({
	Properties: "properties",
	Methods: "methods",
	Signature: "signature",
	Name: "name",
	Inheritance: "inheritance",
});

const SIGNAL_ORDER = Object.freeze([SIGNAL.Properties, SIGNAL.Methods, SIGNAL.Signature, SIGNAL.Name, SIGNAL.Inheritance]);

// ═══ 2. Tiers (three, unlike utils' two) ════════════════════════════════════
const TIER = Object.freeze({
	Duplicate: "duplicate",
	Extract: "extract",
	Similar: "similar",
});

const TIER_ORDER = Object.freeze([TIER.Duplicate, TIER.Extract, TIER.Similar]);

// ═══ 3. Kinds of finding ════════════════════════════════════════════════════
const KIND = Object.freeze({
	Duplicate: "duplicate",
	Extract: "extract",
	Similar: "similar",
	Cluster: "cluster",
	Inclusion: "inclusion",
	Dropped: "dropped",
});

const KIND_LIST = Object.freeze([KIND.Duplicate, KIND.Extract, KIND.Similar, KIND.Cluster, KIND.Inclusion, KIND.Dropped]);

// ═══ 4. Sentence codes — the only source of any verdict/message ═════════════
const CODE = Object.freeze({
	Duplicate: "duplicate",
	Extract: "extract",
	Similar: "similar",
	Cluster: "cluster",
	Inclusion: "inclusion",
	FilteredOut: "filteredOut",
	Confidence: "confidence",
	Headline: "headline",

	// Messages that are not about a finding: the run's own words.
	OptionValue: "optionValue",
	OptionInvalid: "optionInvalid",
	UnknownArgument: "unknownArgument",
	NoScanRoots: "noScanRoots",
	ConfigUnreadable: "configUnreadable",
	ParseFailed: "parseFailed",
	NoticeDetail: "noticeDetail",
	CatalogWriteFailed: "catalogWriteFailed",
	Crash: "crash",
});

// The one prefix every warning carries, so a line on stderr is attributable.
const WARN_PREFIX = "[entities-uniqueness] ";

// ═══ 5. Sides of a comparison ═══════════════════════════════════════════════
// Entities compares all pairs symmetrically; the two sides are just A and B.
const SIDE = Object.freeze({
	A: "a",
	B: "b",
});

// ═══ 6. Per-row annotation state (the diff gutter) ══════════════════════════
const MARK = Object.freeze({
	Same: "same",
	Differs: "differs",
});

// ═══ 7. Diff row types ══════════════════════════════════════════════════════
const ROW = Object.freeze({
	Equal: "equal",
	Change: "change",
	Add: "add",
	Remove: "remove",
	Fold: "fold",
});

// ═══ 8. Diff, code reading and overview limits ══════════════════════════════
const DIFF_CONTEXT = 3; // unchanged lines kept around a change before folding
const MAX_WORD_TOKENS = 400; // above this a changed line is not word-diffed

// How a source line is cut into comparable words (identifiers, runs of space, and
// single punctuation marks) — the word diff highlights inside a changed line.
// NOT frozen: a global regex carries `lastIndex`, so freezing it breaks `match`.
const WORD_TOKEN_RE = /[\w$]+|\s+|[^\w$\s]/g;

// ═══ 9. Actions a repair can carry ══════════════════════════════════════════
const ACTION = Object.freeze({
	UseShared: "use-shared",
	ExtractType: "extract-type",
	MergeEntities: "merge-entities",
	None: "none",
});

// ═══ 10. Tone of a "why" line ═══════════════════════════════════════════════
const TONE = Object.freeze({
	Agree: "agree",
	Disagree: "disagree",
	Veto: "veto",
	Off: "off",
});

module.exports = {
	SIGNAL,
	SIGNAL_ORDER,
	TIER,
	TIER_ORDER,
	KIND,
	KIND_LIST,
	CODE,
	WARN_PREFIX,
	SIDE,
	MARK,
	ROW,
	DIFF_CONTEXT,
	MAX_WORD_TOKENS,
	WORD_TOKEN_RE,
	ACTION,
	TONE,
};

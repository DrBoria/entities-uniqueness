"use strict";

// THE CODES. One table, one id per thing the tool can say about an entity.
//
// This is the piece that makes the CLI, the ESLint message and the HTML page
// agree: nothing anywhere writes a sentence of its own. A producer states a CODE
// plus its PARAMETERS (`{ code: "duplicate", params: { left, right, confidence } }`),
// and every surface renders it through `render()` here:
//
//   * the decision carries `render("confidence", …)`,
//   * the terminal report prints `render(finding.code, finding.params)`,
//   * the page shows the same string, and colours it by the code's `kind`.
//
// A new kind of finding is one entry here — not a sentence in five files.

const { PHRASES, fill } = require("../vocabulary/phrases");
const { MESSAGES } = require("../vocabulary/messages");
const { kindOf } = require("../vocabulary/labels");
const { CODE, KIND } = require("../../../constants");

// `kind` is the finding class the code belongs to (it decides the colour and the
// grouping in both reports). `sentence` turns parameters into the one wording.
const CODES = {
	// ── Verdicts ────────────────────────────────────────────────────────────
	[CODE.Duplicate]: { kind: KIND.Duplicate, sentence: (p) => fill(PHRASES.duplicate, p) },
	[CODE.Extract]: { kind: KIND.Extract, sentence: (p) => fill(PHRASES.extract, p) },
	[CODE.Similar]: { kind: KIND.Similar, sentence: (p) => fill(PHRASES.similar, p) },
	[CODE.Cluster]: { kind: KIND.Cluster, sentence: (p) => fill(PHRASES.cluster, p) },
	[CODE.Inclusion]: { kind: KIND.Inclusion, sentence: (p) => fill(PHRASES.inclusion, p) },
	[CODE.FilteredOut]: { kind: KIND.Dropped, sentence: (p) => fill(PHRASES.filtered, p) },

	// ── Explanations ────────────────────────────────────────────────────────
	[CODE.Confidence]: { kind: null, sentence: (p) => fill(PHRASES.confidence, p) },
	[CODE.Headline]: { kind: null, sentence: (p) => fill(PHRASES.headline, p) },

	// ── The run's own words (not findings) ──────────────────────────────────
	[CODE.OptionValue]: { kind: null, sentence: (p) => fill(MESSAGES.optionValue, p) },
	[CODE.OptionInvalid]: { kind: null, sentence: (p) => fill(MESSAGES.optionInvalid, p) },
	[CODE.UnknownArgument]: { kind: null, sentence: (p) => fill(MESSAGES.unknownArgument, p) },
	[CODE.NoScanRoots]: { kind: null, sentence: () => MESSAGES.noScanRoots },
	[CODE.ConfigUnreadable]: { kind: null, sentence: (p) => fill(MESSAGES.configUnreadable, p) },
	[CODE.ParseFailed]: { kind: null, sentence: (p) => fill(MESSAGES.parseFailed, p) },
	[CODE.NoticeDetail]: { kind: null, sentence: (p) => fill(MESSAGES.noticeDetail, p) },
	[CODE.CatalogWriteFailed]: { kind: null, sentence: (p) => fill(MESSAGES.catalogWriteFailed, p) },
	[CODE.Crash]: { kind: null, sentence: (p) => fill(MESSAGES.crash, p) },
};

// An unknown code is a producer bug, but it must not crash a report: the id is
// printed where the sentence should be, which is exactly what makes it findable.
const render = (code, params) => {
	const entry = CODES[code];
	if (!entry) return String(code);

	return entry.sentence(params ?? {});
};

const kindOfCode = (code) => CODES[code]?.kind ?? null;

// The finding class for a code, with the shared label/colour of that class.
const metaOfCode = (code) => kindOf(kindOfCode(code) ?? KIND.Similar);

module.exports = { CODES, render, kindOfCode, metaOfCode };

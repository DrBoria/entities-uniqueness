"use strict";

// Every message that is NOT about a verdict: what the run says when it cannot
// start (`no scan roots`), cannot read (`could not parse …`), cannot write
// (`catalog could not be written`) or genuinely broke.
//
// They live beside the verdict wording for the same reason: the CLI must not
// hold a private copy of a sentence, and a message that appears both in the log
// and in the report has to read identically in both.
//
// `{placeholders}` are filled by the caller — the renderer never guesses.

const MESSAGES = Object.freeze({
	// ── Command line ────────────────────────────────────────────────────────
	optionValue: "{flag} requires a value{suffix}",
	optionInvalid: "{flag} {requirement}",
	unknownArgument: "unknown argument: {arg} (see --help)",

	// ── Preconditions ───────────────────────────────────────────────────────
	noScanRoots: "no scan roots: pass --roots <dir1>:<dir2> or set roots in the rule options (eslint.config.js / md-code-entities-uniqueness.config.js)",

	// ── Files the run could not read ────────────────────────────────────────
	configUnreadable: "could not read {path}",
	parseFailed: "could not parse {path}: {reason}",
	noticeDetail: "{message}: {reason}",

	// ── Caches the run could not finish ─────────────────────────────────────
	catalogWriteFailed: "catalog: could not write {path}: {reason}",

	// ── The engine itself ───────────────────────────────────────────────────
	crash: "entities-uniqueness: the run failed for a reason that is not in the code\n{detail}",
});

module.exports = { MESSAGES };

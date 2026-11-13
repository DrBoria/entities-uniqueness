"use strict";

// A finding states WHAT is wrong; a repair states WHAT TO DO. The two are kept
// apart because the same verdict can be repaired in more than one way (point at
// the shared type, or extract a new one), and because the HTML page links a
// repair to the exact place it applies to.
//
// Every repair is `{ action, text, target }`:
//   action — a stable id (`use-shared`, `extract-type`, `merge-entities`,
//            `none`) so the UI can label it without parsing the sentence;
//   text   — the sentence, from the vocabulary;
//   target — the place the repair points at (path + range), when it has one.

const { PHRASES, fill } = require("./errorTypes/vocabulary/phrases");
const { ACTION } = require("../constants");

const useShared = (left, right) => ({
	action: ACTION.UseShared,
	text: fill(PHRASES.fixUseShared, { left: left.name, right: right.name, path: right.path }),
	target: right.path ? { path: right.path, line: right.line ?? 1 } : null,
});

const extractType = (left, right, members) => ({
	action: ACTION.ExtractType,
	text: fill(PHRASES.fixExtractType, {
		left: left.name,
		right: right.name,
		members: (members ?? []).map((m) => `\`${m}\``).join(", ") || "the shared members",
	}),
	target: null,
});

const merge = (left, right) => ({
	action: ACTION.MergeEntities,
	text: fill(PHRASES.fixMerge, { left: left.name, right: right.name }),
	target: null,
});

const none = () => ({ action: ACTION.None, text: PHRASES.fixKeep, target: null });

module.exports = { useShared, extractType, merge, none };

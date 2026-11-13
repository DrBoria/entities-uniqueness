"use strict";

// The NAME model: the two entity names, their token sets, and which tokens are
// shared. The board paints the shared tokens of each name; the CLI prints the
// edit-distance and token-overlap evidence.

const { score, tokenize } = require("../../../matcher/name");

const build = (left, right) => {
	if (!left || !right) return null;
	const signal = score(left, right);
	const aTokens = tokenize(left.name ?? "");
	const bTokens = tokenize(right.name ?? "");
	const bSet = new Set(bTokens);
	const common = aTokens.filter((t) => bSet.has(t));

	return {
		left: { name: left.name ?? "", tokens: aTokens },
		right: { name: right.name ?? "", tokens: bTokens },
		common,
		score: signal.score,
		hasEvidence: signal.hasEvidence,
		evidence: signal.evidence,
	};
};

module.exports = { build };

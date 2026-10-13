"use strict";

// drop-inheritance — if one entity extends or implements the other, they are
// parent/child, not duplicates. A subclass is *expected* to look like its base
// plus more; flagging it as a duplicate is a false positive.

const test = (match) => {
	const a = match.a;
	const b = match.b;
	if (!a || !b || a.name === b.name) return null;
	const aExtendsB = (a.extends || []).includes(b.name) || (a.implements || []).includes(b.name);
	const bExtendsA = (b.extends || []).includes(a.name) || (b.implements || []).includes(a.name);
	if (aExtendsB) return `inheritance: ${a.name} extends ${b.name}`;
	if (bExtendsA) return `inheritance: ${b.name} extends ${a.name}`;

	return null;
};

module.exports = { name: "drop-inheritance", test };

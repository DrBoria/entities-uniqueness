"use strict";

// drop-usages — if one entity imports or directly references the other by name,
// they are in a composition/dependency relationship, not a duplicate. Two
// entities where A uses B are expected to differ; flagging them is noise.

const test = (match) => {
	const a = match.a;
	const b = match.b;
	if (!a || !b || a.name === b.name) return null;
	const aUsesB = a.uses?.includes(b.name) || a.imports?.includes(b.name);
	const bUsesA = b.uses?.includes(a.name) || b.imports?.includes(a.name);
	if (aUsesB || bUsesA) return `usage: ${aUsesB ? `${a.name} uses ${b.name}` : `${b.name} uses ${a.name}`}`;

	return null;
};

module.exports = { name: "drop-usages", test };

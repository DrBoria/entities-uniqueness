"use strict";

// An `enum` is a shape: a closed set of names and values. Two enums with the same
// members are one thing spelled twice — the same duplication the object matcher
// already looks for, so an enum is extracted into the SAME entity shape and needs
// no matcher of its own.

const call = (node, method, ...args) => (typeof node[method] === "function" ? node[method](...args) : undefined);
const nodeKind = (node) => (node && typeof node.getKind === "function" ? node.getKind() : null);
const { token } = require("./values.js");

const memberOf = (member) => {
	const initializer = call(member, "getInitializer");
	const value = initializer ? initializer.getText() : null;
	const name = call(member, "getName") || "";

	return { name, value: value ?? null };
};

const extractEnum = (node, { name, exported, sourceFile }) => {
	const members = (call(node, "getMembers") || []).map(memberOf);
	const line = call(node, "getStartLineNumber") ?? 1;

	return {
		id: `${sourceFile.getFilePath()}#${name}`,
		name,
		kind: "enum",
		sourceFile: sourceFile.getFilePath(),
		line,
		endLine: call(node, "getEndLineNumber") ?? line,
		exported,
		// The matcher compares `name` + canonical `type`; a member's "type" is the
		// value it stands for, so `A = 1` and `A = 2` are different shapes.
		properties: members.map((m) => ({ name: m.name, type: m.value == null ? "(implicit)" : m.value })),
		// The set of values itself: `enum { Pending = "pending" }` and
		// `type X = "pending"` are the same closed set, and only values say so.
		values: members.map((m) => token(m.value ?? m.name)),
		methods: [],
		constructors: [],
		extends: null,
		implements: [],
		uses: [],
		imports: [],
		framework: null,
		complexity: members.length,
	};
};

module.exports = { extractEnum };

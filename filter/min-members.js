"use strict";

const { filter } = require("remeda");

const minMembersFilter = (records, thresholds) =>
	filter(records, (r) => r.members.length >= thresholds.minMembers && r.members.some((m) => !thresholds.ignoredSet.has(m)));

module.exports = { minMembersFilter };

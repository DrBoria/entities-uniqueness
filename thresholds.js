"use strict";

const DEFAULTS = {
	minMembers: 3,

	suspiciousMinShared: 3,

	duplicateMinShared: 5,

	minOverlapRatio: 0.4,

	ignoredMethods: ["id", "key", "uuid", "createdAt", "updatedAt", "deletedAt", "deleted", "created", "updated", "version", "type"],

	requireExported: false,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function resolveThresholds(opts) {
	const o = opts && typeof opts === "object" ? opts : {};
	const num = (key) => (typeof o[key] === "number" && Number.isFinite(o[key]) ? o[key] : DEFAULTS[key]);
	const bool = (key) => (typeof o[key] === "boolean" ? o[key] : DEFAULTS[key]);
	const arr = (key) => (Array.isArray(o[key]) ? o[key].map(String) : DEFAULTS[key]);

	return {
		minMembers: Math.max(1, Math.floor(num("minMembers"))),
		suspiciousMinShared: Math.max(1, Math.floor(num("suspiciousMinShared"))),
		duplicateMinShared: Math.max(1, Math.floor(num("duplicateMinShared"))),
		minOverlapRatio: clamp01(num("minOverlapRatio")),
		ignoredMethods: arr("ignoredMethods"),
		requireExported: bool("requireExported"),
	};
}

module.exports = { DEFAULTS, resolveThresholds };

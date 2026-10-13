"use strict";

// Framework registry + dispatch.
//
// Each framework normalizer is a separate file exporting:
//   { id, detect(sourceText) -> boolean, normalize(entities, ctx) -> entities }
//
// `detect` is a cheap text-level check (import specifier / call pattern) so we
// only pay the cost of `normalize` for frameworks actually present in a file.
// `normalize` enriches the base UnifiedEntities (tags `framework`, and for
// schema frameworks like zod extracts properties the base normalizer cannot see).
//
// To add a framework: drop a file in this directory and add it to REGISTRY.

const REGISTRY = {
	zod: () => require("./zod"),
	mobx: () => require("./mobx"),
	redux: () => require("./redux"),
	zustand: () => require("./zustand"),
	"class-validator": () => require("./class-validator"),
};

const cache = new Map();

const getNormalizers = () => {
	if (cache.size) return [...cache.values()];
	for (const [id, loader] of Object.entries(REGISTRY)) {
		try {
			const n = loader();
			if (n && n.id && typeof n.detect === "function" && typeof n.normalize === "function") cache.set(id, n);
		} catch {
			// A broken framework file must not take the whole pipeline down.
		}
	}

	return [...cache.values()];
};

// Runs every detected framework normalizer over the entities of one file.
// `ctx` is the parseAndExtract context ({ sourceFile, text, imports }).
const normalizeEntities = (entities, ctx) => {
	let result = entities;
	for (const n of getNormalizers()) {
		try {
			if (n.detect(ctx.text)) result = n.normalize(result, ctx);
		} catch {
			// ignore a framework normalizer failure; keep the base entities
		}
	}

	return result;
};

module.exports = { normalizeEntities, getNormalizers, REGISTRY };

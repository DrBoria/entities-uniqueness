"use strict";

// Aggregates the five similarity signals for a pair of entities.
//
// Each signal returns { score: 0..1, evidence }. The decision-maker combines
// them with weights; the report prints every signal's evidence so a score is
// always explainable.

const properties = require("./properties");
const methods = require("./methods");
const signature = require("./signature");
const name = require("./name");
const inheritance = require("./inheritance");

const matchSignals = (a, b, opts = {}) => ({
	properties: properties.score(a, b, opts),
	methods: methods.score(a, b, opts),
	signature: signature.score(a, b, opts),
	name: name.score(a, b, opts),
	inheritance: inheritance.score(a, b, opts),
});

module.exports = { matchSignals, properties, methods, signature, name, inheritance };

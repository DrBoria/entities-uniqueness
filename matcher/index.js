"use strict";

// Aggregates the per-signal matchers into a single signal bundle.
//
// Each signal reports { score, hasEvidence, evidence } so the decision maker
// can weight them and explain its verdict. See ./properties.js, ./methods.js,
// ./signature.js, ./name.js, ./inheritance.js for the individual matchers.

const properties = require("./properties.js");
const methods = require("./methods.js");
const signature = require("./signature.js");
const name = require("./name.js");
const inheritance = require("./inheritance.js");

const matchSignals = (a, b, opts = {}) => ({
	properties: properties.score(a, b, opts),
	methods: methods.score(a, b, opts),
	signature: signature.score(a, b, opts),
	name: name.score(a, b, opts),
	inheritance: inheritance.score(a, b),
});

module.exports = { matchSignals, properties, methods, signature, name, inheritance };

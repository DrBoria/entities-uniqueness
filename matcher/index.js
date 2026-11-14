"use strict";

// Aggregates the per-signal matchers into a single signal bundle.
//
// Each signal reports { score, hasEvidence, evidence } so the decision maker
// can weight them and explain its verdict. See ./properties.js, ./methods.js,
// ./signature.js, ./values.js, ./inheritance.js for the individual matchers.
//
// `name` is computed too, but it is NOT a verdict tab: it is the always-on bonus
// the decision-maker folds into the signature verdict (a name is part of a
// signature). The report shows it inside the Signature group, never on its own.

const properties = require("./properties.js");
const methods = require("./methods.js");
const signature = require("./signature.js");
const values = require("./values.js");
const name = require("./name.js");
const inheritance = require("./inheritance.js");

const matchSignals = (a, b, opts = {}) => ({
	properties: properties.score(a, b, opts),
	methods: methods.score(a, b, opts),
	signature: signature.score(a, b, opts),
	values: values.score(a, b, opts),
	inheritance: inheritance.score(a, b),
	name: name.score(a, b, opts),
});

module.exports = { matchSignals, properties, methods, signature, values, name, inheritance };

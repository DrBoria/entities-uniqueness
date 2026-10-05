"use strict";

const { filter } = require("remeda");

const isImplementation = (rec) => rec.kind === "partial" || rec.kind === "typeof" || rec.kind === "infer";

const dropImplementations = (records) => filter(records, (r) => !isImplementation(r));

module.exports = { dropImplementations };

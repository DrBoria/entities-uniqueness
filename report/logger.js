"use strict";

// The stage log lives at the engine root (`../logger.js`); the report reads the
// same one so a `--log` run and the report share a single stream.
module.exports = require("../logger");

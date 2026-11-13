"use strict";

// Small evidence helpers the report's React app reads. The entities engine keeps
// its scoring in the matchers and `tuning.js`; this module only turns a 0..1
// score into the reader's percentage, the same way every surface prints it.

// A share as a whole percent: 0.8666… → 87.
const percentOf = (value) => Math.round((Number.isFinite(value) ? value : 0) * 100);

module.exports = { percentOf };

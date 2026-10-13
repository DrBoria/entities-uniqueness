"use strict";

// class-validator normalizer — tags classes using @IsString / @IsEmail /
// @IsDefined / @Matches and friends, so DTO-shaped classes are recognized.
//
// The set of decorator names is derived from the real class-validator package.

const cv = require("class-validator");

// Decorators exported by class-validator that mark a class as a validated DTO.
// The list is derived from the package itself — no hardcoded names here.
const VALIDATOR_DECORATORS = new Set(
  Object.keys(cv).filter((k) => /^(Is[A-Z]\w*|Matches|Validate\w*|Min\w+|Max\w+|Length|Contains|NotContains|StartsWith|EndsWith)$/.test(k))
);

const detect = (text) =>
  /from\s*["']class-validator["']/.test(text) || [...VALIDATOR_DECORATORS].some((d) => new RegExp(`@${d}\\b`).test(text));

const normalize = (entities) =>
  entities.map((e) => {
    if (e.kind !== "class") return e;
    const usesCv = e.uses.some((u) => VALIDATOR_DECORATORS.has(u));
    return usesCv ? { ...e, framework: e.framework || "class-validator" } : e;
  });

module.exports = { id: "class-validator", detect, normalize, VALIDATOR_DECORATORS };

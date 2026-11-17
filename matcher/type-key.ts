"use strict";

// The comparison key of a canonical property type.
//
// Optionality is a MODIFIER, not a different type: `string` and `string?`
// (a required field and an optional one, `z.string()` and `z.string().optional()`,
// `x: string` and `x?: string`) describe the same data shape — one merely allows
// absence. Two shapes that differ only in which fields are optional are still
// the same shape, so agreement compares the BASE type, with the trailing `?`
// stripped. The stored type keeps its `?` for display; only the comparison drops it.
//
// Genuinely different base types (`string` vs `number`, `T[]` vs `Record<K,T>`)
// keep disagreeing — this is not a blanket "types are close enough".

const typeKey = (type) => String(type ?? "").replace(/\?$/, "");

/** Do two canonical types agree on their base shape (optionality aside)? */
const typesAgree = (a, b) => typeKey(a) === typeKey(b);

export { typeKey, typesAgree };
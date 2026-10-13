"use strict";

// Redux normalizer — tags entities built with createSlice / createAsyncThunk /
// configureStore / createEntityAdapter / ...
//
// The set of builder names is derived from the real @reduxjs/toolkit package,
// not a hardcoded word list (the old "reducer|actions" fallback produced
// false positives).

const rtk = require("@reduxjs/toolkit");

// Builder creators exported by @reduxjs/toolkit that mark a store/slice.
const RTK_BUILDERS = new Set(
  Object.keys(rtk).filter((k) => /^(create\w+|configureStore|combineReducers)$/.test(k))
);

const detect = (text) =>
  /from\s*["']@reduxjs\/toolkit["']/.test(text) || [...RTK_BUILDERS].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));

const normalize = (entities) =>
  entities.map((e) => {
    const usesRtk = e.uses.some((u) => RTK_BUILDERS.has(u));
    return usesRtk ? { ...e, framework: e.framework || "redux" } : e;
  });

module.exports = { id: "redux", detect, normalize, RTK_BUILDERS };

"use strict";

// Drop pairs that involve a store's OWN generated type.
//
// A framework store (e.g. an MST `t.model`) generates an instance type
// (`Instance<typeof Model>`). That generated type is the store's own output —
// comparing it against the store, or against another generated type of the same
// store, is not a hand-written duplicate. The base normalizer does not extract
// `typeof`-containing aliases, so these pairs are rare; this filter is the
// safety net for the tagged `generated` entities the frameworks emit.
//
// It deliberately does NOT drop a hand-written type whose shape copies a store
// model (the `storeModel` entity) — that is exactly the duplicate the
// store-model fast path in the decision-maker is meant to flag.

const isGenerated = (e) => e && e.generated === true;

const test = (match) => {
	const { a, b } = match;
	// A generated type vs the store model that generated it.
	if (isGenerated(a) && b.storeModel) return "a is the generated type of store model b";
	if (isGenerated(b) && a.storeModel) return "b is the generated type of store model a";
	// Two generated types of the same store model.
	if (isGenerated(a) && isGenerated(b) && a.modelName === b.modelName) return "both are generated types of the same store model";

	return null;
};

module.exports = { name: "drop-store-linked", test };

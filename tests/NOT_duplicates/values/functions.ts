// Two objects whose only shared "value" is a function. Functions are NOT compared
// by value (their bodies differ), so the values engine must not call these a
// renamed copy on the strength of the function markers alone.

export const HANDLER_A = {
	label: "alpha",
	run: () => 1,
};

export const HANDLER_B = {
	label: "beta",
	run: () => 2,
};
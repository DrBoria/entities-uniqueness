// Control: an object literal whose members all resolve to concrete types
// (string / number / boolean). A genuine near-duplicate of this should still
// score high on the properties signal — the generic-type fix must not over-
// discount real, verified type agreement.
export const profileA = {
	id: "1",
	name: "Ada",
	email: "ada@example.com",
	age: 36,
	active: true,
};

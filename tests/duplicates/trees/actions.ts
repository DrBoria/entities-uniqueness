// Duplicate property NAMES (key/label/onClick twice) so the raw properties.length
// (7) is LARGER than FooterAction's (4) even though FooterAction's name set is
// the strict superset. The decision maker must orient parent/child by the
// unique-name set, not the raw length: FooterAction is the parent.
export const actions = {
	key: "a",
	label: "A",
	onClick: () => {},
	key: "b",
	label: "B",
	onClick: () => {},
};

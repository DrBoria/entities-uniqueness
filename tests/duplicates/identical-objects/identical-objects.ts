// Two byte-identical object literals with untyped (placeholder) properties.
// This mirrors the real-world case: `let styling: SomeType = {...}` where the
// normalizer cannot resolve the type annotation, so all properties get the
// generic "object"/"value" canonical types. Despite that, the shapes are
// 100% identical and must be flagged as duplicates.

const makeDecoration = () => {
	let stylingA = {
		after: {},
		dark: { after: {} },
		light: { after: {} },
		rangeBehavior: 2,
	};

	let stylingB = {
		after: {},
		dark: { after: {} },
		light: { after: {} },
		rangeBehavior: 2,
	};

	return [stylingA, stylingB];
};

export default makeDecoration;

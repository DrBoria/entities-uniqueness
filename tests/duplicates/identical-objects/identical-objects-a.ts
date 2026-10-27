// Cross-file duplicate pair, part A: mirrors the real case where
// `styling` lives in decorations.ts and its twin `styling2` in
// host-decorations.ts. Untyped (placeholder) properties, identical shape.
export const stylingA = {
	after: {},
	dark: { after: {} },
	light: { after: {} },
	rangeBehavior: 2,
};

// A generic-shaped (un-annotated) object. Shares 4 of its 5 fields with
// shape-b, but the fifth differs (twitter vs keywords) — so the pair is NOT
// byte-identical. With generic placeholder types the properties signal must
// stay well below the saturated 1.00 thanks to the generic-shape discount.
export const shapeA = {
	title: "Dashboard",
	description: "Manage your workspace",
	alternates: { canonical: "/dashboard" },
	openGraph: { title: "Dashboard", images: ["/og/dashboard.png"] },
	twitter: { card: "summary_large_image" },
};

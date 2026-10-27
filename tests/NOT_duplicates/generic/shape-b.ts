// A second generic-shaped object that shares 4 of shape-a's 5 fields but
// differs on the fifth (keywords instead of twitter). Not a true duplicate —
// the generic-shape discount keeps the properties signal below 1.00.
export const shapeB = {
	title: "Settings",
	description: "Configure your account",
	alternates: { canonical: "/settings" },
	openGraph: { title: "Settings", images: ["/og/settings.png"] },
	keywords: ["settings", "account"],
};

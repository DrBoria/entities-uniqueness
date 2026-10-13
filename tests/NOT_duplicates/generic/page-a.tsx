// Mimics a Next.js route metadata export: an un-annotated object literal.
// The normalizer cannot infer concrete types for these members, so they come
// out as generic placeholders (value / object / array / call).
export const metadata = {
	title: "Dashboard",
	description: "Manage your workspace",
	alternates: { canonical: "/dashboard" },
	openGraph: { title: "Dashboard", images: ["/og/dashboard.png"] },
	twitter: { card: "summary_large_image" },
	keywords: ["dashboard", "workspace"],
};

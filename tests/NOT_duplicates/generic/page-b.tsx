// A second Next.js route with the same metadata shape but different content.
// Structurally similar, but NOT a true duplicate — the score must stay below 1.0.
export const metadata = {
	title: "Settings",
	description: "Configure your account",
	alternates: { canonical: "/settings" },
	openGraph: { title: "Settings", images: ["/og/settings.png"] },
	twitter: { card: "summary" },
	keywords: ["settings", "account"],
};

// Same structure as digest-settings.ts, all keys renamed, but 6 of the 12
// leaf values differ: daily/18/tue/fri, mobile=true, cap=40. Partial value
// overlap must NOT produce a duplicate verdict.
export const alertPreferences = {
	timing: { rhythm: "daily", hourLocal: 18, weekdays: ["tue", "fri"] },
	delivery: { inbox: true, mobile: true, text: false },
	rules: { threshold: 2, blockedTags: ["promo", "surveys"], cap: 40 },
	language: "en-US",
};

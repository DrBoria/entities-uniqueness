// Digest notification settings. The twin in alert-preferences.ts renamed
// every key and changed exactly half of the leaf values.
export const digestSettings = {
	schedule: { cadence: "weekly", hourUtc: 9, days: ["mon", "thu"] },
	channels: { email: true, push: false, sms: false },
	filters: { minSeverity: 2, mutedTopics: ["promo", "surveys"], maxItems: 25 },
	locale: "en-US",
};

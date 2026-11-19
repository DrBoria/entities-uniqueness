// Release-gate configuration. Every key name here is original; the twin in
// rollout-policy.ts renamed every key but kept every value identical.
export const releaseGate = {
	rollout: {
		percentage: 25,
		regions: ["eu-west-1", "us-east-1"],
		cohorts: [
			{ name: "internal", weight: 10, enabled: true },
			{ name: "beta", weight: 40, enabled: false },
		],
	},
	limits: {
		requestsPerMinute: 1200,
		burst: 300,
		retry: { attempts: 3, backoffMs: 250, jitter: true },
	},
	killSwitch: false,
};

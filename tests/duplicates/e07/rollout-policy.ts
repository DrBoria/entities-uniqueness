// Renamed copy of release-gate.ts: ALL key names differ at every nesting
// level, but the deep value tree (structure, arrays, leaves) is identical.
export const rolloutPolicy = {
	traffic: {
		share: 25,
		zones: ["eu-west-1", "us-east-1"],
		segments: [
			{ label: "internal", priority: 10, active: true },
			{ label: "beta", priority: 40, active: false },
		],
	},
	quotas: {
		callsPerMinute: 1200,
		surge: 300,
		retries: { tries: 3, delayMs: 250, randomize: true },
	},
	emergencyStop: false,
};

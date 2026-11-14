// Two objects with the SAME shape and the SAME field names but DIFFERENT values.
// They are NOT duplicates: the values engine must keep them apart even though the
// shape matchers see full name/type overlap.

export const LIMITS_A = {
	maxRetries: 3,
	timeoutMs: 5000,
	endpoints: ["https://a.example", "https://b.example"],
	featureFlags: { search: true, upload: false },
};

export const LIMITS_B = {
	maxRetries: 7,
	timeoutMs: 9000,
	endpoints: ["https://c.example", "https://d.example"],
	featureFlags: { search: false, upload: true },
};
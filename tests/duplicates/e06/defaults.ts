// Unannotated default object: duplicates NotificationEndpoint's shape and
// fills it with concrete values. No `implements`, no annotation — the named
// type and this object are separate entities that describe the same thing.
export const defaultDeliveryTarget = {
	url: "https://hooks.internal.example/notify",
	secret: "whsec_9f2c",
	events: ["order.paid", "order.refunded"],
	active: true,
	timeoutMs: 5000,
	retryCount: 3,
	headers: { authorization: "Bearer svc-token", contentType: "application/json" },
	createdAt: 0,
};

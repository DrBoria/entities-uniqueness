// Base webhook event contract.
export interface WebhookEvent {
	eventId: string;
	type: string;
	occurredAt: number;
	payload: string;
	source: string;
	deliveryAttempt: number;
}

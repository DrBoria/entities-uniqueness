// Contract for an outbound notification endpoint.
export interface NotificationEndpoint {
	url: string;
	secret: string;
	events: string[];
	active: boolean;
	timeoutMs: number;
	retryCount: number;
	headers: { authorization: string; contentType: string };
	createdAt: number;
}

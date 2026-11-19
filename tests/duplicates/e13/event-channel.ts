// Contract for a publish/subscribe event channel.
export interface EventChannel {
	brokerUrl: string;
	topic: string;
	clientId: string;
	connected: boolean;
	publish(eventType: string, payload: string): Promise<void>;
	subscribe(pattern: string): Promise<void>;
	flush(): Promise<void>;
	close(): Promise<void>;
}

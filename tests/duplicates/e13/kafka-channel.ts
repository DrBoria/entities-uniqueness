import type { EventChannel } from "./event-channel";

// Implements EventChannel faithfully, but carries extra private machinery
// (reconnect timer, batching, offset acks) that the interface knows nothing
// about. Shared shape is real, but the class is a superset — similar, not a
// clean duplicate.
export class KafkaEventChannel implements EventChannel {
	brokerUrl: string = "kafka://broker.internal:9092";
	topic: string = "domain-events";
	clientId: string = "event-publisher";
	connected: boolean = false;

	private reconnectTimer: number = 0;
	private pendingBatch: string[] = [];
	private committedOffset: number = 0;

	publish(eventType: string, payload: string): Promise<void> {
		this.pendingBatch.push(`${eventType}:${payload}`);
		return Promise.resolve();
	}

	subscribe(pattern: string): Promise<void> {
		void pattern;
		return Promise.resolve();
	}

	flush(): Promise<void> {
		this.pendingBatch = [];
		return Promise.resolve();
	}

	close(): Promise<void> {
		this.connected = false;
		return Promise.resolve();
	}

	private scheduleReconnect(delayMs: number): void {
		this.reconnectTimer = delayMs;
	}

	private encodeEnvelope(eventType: string): string {
		return `${this.clientId}/${eventType}`;
	}

	private ackOffset(offset: number): void {
		this.committedOffset = offset;
	}

	private drainBatch(): string[] {
		return this.pendingBatch.splice(0);
	}
}

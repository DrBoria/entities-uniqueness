import { EventEmitter } from "../events/EventEmitter";

export class UserEventEmitter extends EventEmitter {
	private userId: string;

	constructor(userId: string) {
		super();
		this.userId = userId;
	}

	on(event: string, fn: () => void): void {
		super.on(event, fn);
	}

	off(event: string, fn: () => void): void {
		super.off(event, fn);
	}

	emit(event: string): void {
		super.emit(event);
	}

	count(event: string): number {
		return super.count(event);
	}
}

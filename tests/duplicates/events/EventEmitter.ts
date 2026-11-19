export class EventEmitter {
	private listeners: Record<string, Array<() => void>> = {};

	on(event: string, fn: () => void): void {
		(this.listeners[event] ??= []).push(fn);
	}

	off(event: string, fn: () => void): void {
		this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
	}

	emit(event: string): void {
		for (const fn of this.listeners[event] || []) fn();
	}

	count(event: string): number {
		return (this.listeners[event] || []).length;
	}
}

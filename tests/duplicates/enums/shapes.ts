// Two enums are one thing spelled twice, and a type parameter is a hole rather
// than a name: `Box<T> { value: T }` and `Box<U> { value: U }` are the same shape.
export enum PaymentStatus {
	Pending = "pending",
	Paid = "paid",
}

export enum InvoiceStatus {
	Pending = "pending",
	Paid = "paid",
}

export interface Box<T> {
	value: T;
	get(): T;
}

export interface Crate<U> {
	value: U;
	get(): U;
}

// The same closed set of values, spelled without names: an enum and this union
// are one shape, and only the VALUES can tell.
export type PaymentState = "pending" | "paid";

// Declarations that carry MORE than their shape.
@Component({ selector: "x" })
export class Widget {
	static count = 0;
	readonly id: string = "";
	#secret = 1;
	value = 2;
}

export const config = { retries: 3 } as const;

export interface Settings {
	retries: number;
}

export const settings = { retries: 3 } satisfies Settings;

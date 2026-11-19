// Hand-written domain interface for a payment. Same fields as the zod
// schema, declared in a different order, no runtime validation attached.
export interface Payment {
	receiptUrl?: string;
	method: "card" | "paypal" | "bank_transfer";
	paymentId: string;
	refunded: boolean;
	amountCents: number;
	orderId: string;
	paidAt: number | null;
	currency: string;
}

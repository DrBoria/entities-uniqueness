import { z } from "zod";

// Zod validation schema for incoming payment webhooks.
export const PaymentSchema = z.object({
	paymentId: z.string(),
	orderId: z.string(),
	amountCents: z.number().int(),
	currency: z.string().length(3),
	method: z.enum(["card", "paypal", "bank_transfer"]),
	paidAt: z.number().nullable(),
	refunded: z.boolean(),
	receiptUrl: z.string().optional(),
});

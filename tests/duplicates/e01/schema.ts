// GraphQL schema shape, hand-maintained as a TS interface (no codegen).
// Mirrors the `Order` type exposed by the public GraphQL API.
export interface GqlOrder {
	id: string;
	customerId: string;
	status: string;
	totalCents: number;
	currency: string;
	placedAt: string;
	lines: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
	shippingAddress: {
		line1: string;
		city: string;
		postalCode: string;
		country: string;
	};
}

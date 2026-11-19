// Apollo client fragment shape, written as a type literal for `useQuery`.
// Same fields as the server-side GraphQL interface, but the author copied
// them in a different order and renamed the type.
export type OrderFragment = {
	shippingAddress: {
		line1: string;
		city: string;
		postalCode: string;
		country: string;
	};
	placedAt: string;
	lines: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
	currency: string;
	id: string;
	totalCents: number;
	status: string;
	customerId: string;
};

// Shares sku/qty/price with OrderLine but differs on discount vs total — an
// intersection (extract) candidate, not a subset.
export interface CartLine {
	sku: string;
	qty: number;
	price: number;
	discount: number;
}

// Comparable to CartLine: same size, large shared intersection, NOT a subset.
export interface OrderLine {
	sku: string;
	qty: number;
	price: number;
	total: number;
}

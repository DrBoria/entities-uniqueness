import { create } from "zustand";

// Zustand store shape for the same shopping cart, written independently
// by another team. Identical fields, different declaration style.
export type CartStore = {
	currency: string;
	items: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
	discountCents: number;
	couponCode: string | null;
	updatedAt: number;
	subtotalCents: number;
};

export const useCartStore = create<CartStore>()((set) => ({
	currency: "USD",
	items: [],
	discountCents: 0,
	couponCode: null,
	updatedAt: 0,
	subtotalCents: 0,
}));

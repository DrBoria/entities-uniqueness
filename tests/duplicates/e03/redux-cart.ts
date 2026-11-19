import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Redux Toolkit slice state for the shopping cart.
export interface CartState {
	items: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
	couponCode: string | null;
	currency: string;
	subtotalCents: number;
	discountCents: number;
	updatedAt: number;
}

const initialState: CartState = {
	items: [],
	couponCode: null,
	currency: "USD",
	subtotalCents: 0,
	discountCents: 0,
	updatedAt: 0,
};

export const cartSlice = createSlice({
	name: "cart",
	initialState,
	reducers: {
		itemAdded(state, action: PayloadAction<{ sku: string; unitPriceCents: number }>) {
			state.items.push({ sku: action.payload.sku, quantity: 1, unitPriceCents: action.payload.unitPriceCents });
		},
		couponApplied(state, action: PayloadAction<string>) {
			state.couponCode = action.payload;
		},
		cartCleared(state) {
			state.items = [];
			state.couponCode = null;
		},
	},
});

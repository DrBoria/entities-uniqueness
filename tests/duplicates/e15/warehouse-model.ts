import { types } from "mobx-state-tree";

// MST model describing a warehouse. Same domain shape as the MobX
// WarehouseStore class in warehouse-store.ts.
export const WarehouseModel = types.model("Warehouse", {
	warehouseId: types.string,
	name: types.string,
	capacity: types.number,
	occupied: types.number,
	managerId: types.maybe(types.string),
	active: types.boolean,
	updatedAt: types.number,
});

import { makeObservable, observable } from "mobx";

// MobX observable class for the same warehouse domain shape as the MST
// WarehouseModel. Framework difference (MST vs plain MobX) must not hide
// the duplicate.
export class WarehouseStore {
	warehouseId!: string;
	name!: string;
	capacity!: number;
	occupied!: number;
	managerId!: string | undefined;
	active!: boolean;
	updatedAt!: number;

	constructor() {
		makeObservable(this, {
			warehouseId: observable,
			name: observable,
			capacity: observable,
			occupied: observable,
			managerId: observable,
			active: observable,
			updatedAt: observable,
		});
	}
}

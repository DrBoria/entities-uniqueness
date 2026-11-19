// MobX 6 — abstract generic Store + a concrete subclass.
import { makeObservable, observable, action, computed } from "mobx";

export abstract class EntityStore<T extends { id: number }> {
	entities = new Map<number, T>();

	constructor() {
		makeObservable(this, {
			entities: observable,
			count: computed,
			setEntity: action,
			removeEntity: action,
		});
	}

	get count() {
		return this.entities.size;
	}

	setEntity(entity: T) {
		this.entities.set(entity.id, entity);
	}

	removeEntity(id: number) {
		this.entities.delete(id);
	}

	abstract fetch(): Promise<T[]>;
}

export interface User {
	id: number;
	name: string;
}

export class UserEntityStore extends EntityStore<User> {
	selectedId: number | null = null;

	constructor() {
		super();
		makeObservable(this, {
			selectedId: observable,
			select: action,
		});
	}

	select(id: number | null) {
		this.selectedId = id;
	}

	async fetch() {
		return [];
	}
}

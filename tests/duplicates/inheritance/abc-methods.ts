// The A/B/C construction: A has 5 methods, B re-declares 2 of them,
// C extends A and adds 3 more. Inheritance must see C's reuse of A,
// and the methods matcher must grade B ⊂ A as a partial correspondence.
export class ServiceA {
	fetchOne(id: string): Promise<string> {
		return Promise.resolve(id);
	}
	fetchMany(ids: string[]): Promise<string[]> {
		return Promise.resolve(ids);
	}
	saveOne(id: string, value: string): Promise<void> {
		void id;
		void value;
		return Promise.resolve();
	}
	removeOne(id: string): Promise<void> {
		void id;
		return Promise.resolve();
	}
	countAll(): Promise<number> {
		return Promise.resolve(0);
	}
}

export class ServiceB {
	fetchOne(id: string): Promise<string> {
		return Promise.resolve(id);
	}
	saveOne(id: string, value: string): Promise<void> {
		void id;
		void value;
		return Promise.resolve();
	}
}

export class ServiceC extends ServiceA {
	publish(id: string): Promise<void> {
		void id;
		return Promise.resolve();
	}
	archive(id: string): Promise<void> {
		void id;
		return Promise.resolve();
	}
	restore(id: string): Promise<void> {
		void id;
		return Promise.resolve();
	}
}

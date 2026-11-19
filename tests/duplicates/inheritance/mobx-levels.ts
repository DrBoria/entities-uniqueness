// MobX 6 — three-level Store inheritance with override + computed.
import { makeObservable, observable, computed, action, override } from "mobx";

export class BaseStore {
	loading = false;
	error: string | null = null;

	constructor() {
		makeObservable(this, {
			loading: observable,
			error: observable,
			isLoading: computed,
			setLoading: action,
			setError: action,
		});
	}

	get isLoading() {
		return this.loading;
	}

	setLoading(value: boolean) {
		this.loading = value;
	}

	setError(error: string | null) {
		this.error = error;
	}
}

export class ApiStore extends BaseStore {
	requests = 0;

	constructor() {
		super();
		makeObservable(this, {
			requests: observable,
			isLoading: override,
			incrementRequests: action,
		});
	}

	override get isLoading() {
		return this.loading || this.requests > 0;
	}

	incrementRequests() {
		this.requests++;
	}
}

export class UserStore extends ApiStore {
	users: string[] = [];

	constructor() {
		super();
		makeObservable(this, {
			users: observable,
			isLoading: override,
			addUser: action,
		});
	}

	override get isLoading() {
		return super.isLoading || this.users.length === 0;
	}

	addUser(name: string) {
		this.users.push(name);
	}
}

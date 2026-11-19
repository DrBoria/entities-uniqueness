import { makeObservable, observable } from "mobx";

// MobX observable store for an active login session.
export class SessionStore {
	sessionId!: string;
	userId!: string;
	deviceId!: string;
	issuedAt!: number;
	expiresAt!: number;
	ipAddress!: string;
	userAgent!: string;
	revoked!: boolean;

	constructor() {
		makeObservable(this, {
			sessionId: observable,
			userId: observable,
			deviceId: observable,
			issuedAt: observable,
			expiresAt: observable,
			ipAddress: observable,
			userAgent: observable,
			revoked: observable,
		});
	}
}

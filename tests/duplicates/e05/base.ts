// Canonical account record shared by the identity service.
export interface AccountBase {
	accountId: string;
	email: string;
	displayName: string;
	createdAt: number;
	emailVerified: boolean;
}

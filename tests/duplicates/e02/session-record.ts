// Plain wire-format record for a session, as returned by the auth API.
// Same properties as the MobX store, no framework involved.
export interface SessionRecord {
	sessionId: string;
	userId: string;
	deviceId: string;
	issuedAt: number;
	expiresAt: number;
	ipAddress: string;
	userAgent: string;
	revoked: boolean;
}

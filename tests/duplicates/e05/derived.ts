import type { AccountBase } from "./base";

// Legitimate extension: reuses AccountBase and adds premium-only fields.
// This is inheritance/reuse, not duplication (bonus check, not scored).
export interface PremiumAccount extends AccountBase {
	planTier: string;
	seats: number;
}

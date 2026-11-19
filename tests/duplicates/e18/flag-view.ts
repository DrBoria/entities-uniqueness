// Read-only view of runtime feature flags, declared as a plain interface
// with readonly properties.
export interface FeatureFlagView {
	readonly darkMode: boolean;
	readonly betaSearch: boolean;
	readonly maxUploadMb: number;
	readonly sessionTimeoutMinutes: number;
	readonly maintenanceMode: boolean;
	readonly supportEmail: string;
	readonly rolloutPercent: number;
	readonly allowedRegions: string[];
}

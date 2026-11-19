// The SAME feature-flag shape as FeatureFlagView, but exposed through
// getters over a private snapshot instead of stored properties. Sneaky:
// accessors vs properties, plus a private backing field the interface
// knows nothing about.
export class FeatureFlagState {
	private snapshot: Record<string, unknown> = {};

	get darkMode(): boolean {
		return Boolean(this.snapshot.darkMode);
	}

	get betaSearch(): boolean {
		return Boolean(this.snapshot.betaSearch);
	}

	get maxUploadMb(): number {
		return Number(this.snapshot.maxUploadMb ?? 0);
	}

	get sessionTimeoutMinutes(): number {
		return Number(this.snapshot.sessionTimeoutMinutes ?? 0);
	}

	get maintenanceMode(): boolean {
		return Boolean(this.snapshot.maintenanceMode);
	}

	get supportEmail(): string {
		return String(this.snapshot.supportEmail ?? "");
	}

	get rolloutPercent(): number {
		return Number(this.snapshot.rolloutPercent ?? 0);
	}

	get allowedRegions(): string[] {
		return (this.snapshot.allowedRegions as string[]) ?? [];
	}
}

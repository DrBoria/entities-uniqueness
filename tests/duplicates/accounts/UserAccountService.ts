export class UserAccountService {
	private readonly cache = new Map<string, string>();

	constructor(private readonly baseUrl: string) {}

	get(id: string): string {
		return this.cache.get(id) ?? "";
	}

	set(id: string, value: string): void {
		this.cache.set(id, value);
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size;
	}
}

import { makeAutoObservable } from "mobx";

export type RouterModels = Record<string, Record<string, { contextWindow?: number }>>;

// Mirrors Jabberwock/apps/cli/src/ui/store.ts — the store is a makeAutoObservable
// object literal created INSIDE a factory function (not top-level).
export function createCLIStore() {
	const store = makeAutoObservable({
		messages: [] as string[],
		pendingAsk: null as string | null,
		isLoading: false,
		isComplete: false,
		error: null as string | null,
		taskHistory: [] as number[],
		currentTaskId: null as string | null,
		tokenUsage: null as { input: number; output: number } | null,

		addMessage(msg: string) {
			this.messages.push(msg);
		},
		setLoading(v: boolean) {
			this.isLoading = v;
		},
	});
	return store;
}

// A top-level makeAutoObservable store (some codebases do this).
export const topStore = makeAutoObservable({
	count: 0,
	label: "x",
	bump() {
		this.count += 1;
	},
});

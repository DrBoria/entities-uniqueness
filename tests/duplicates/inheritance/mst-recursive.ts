// MST — recursive model via types.late + compose, and flow actions.
import { types, flow, Instance } from "mobx-state-tree";

export const BaseNode = types.model("BaseNode", {
	id: types.identifier,
	name: types.string,
});

export const TreeNode = types
	.compose(
		"TreeNode",
		BaseNode,
		types.model({
			children: types.optional(types.array(types.late(() => TreeNode)), []),
			parentId: types.maybeNull(types.string),
		})
	)
	.views((self) => ({
		get depth(): number {
			if (!self.parentId) return 0;
			return 1;
		},
		get descendantsCount(): number {
			return self.children.reduce((total, child) => total + 1 + child.descendantsCount, 0);
		},
	}))
	.actions((self) => ({
		addChild(name: string) {
			self.children.push({ id: String(Date.now()), name, parentId: self.id });
		},
	}));

export type TreeNodeInstance = Instance<typeof TreeNode>;

export const RequestStore = types
	.model("RequestStore", {
		loading: false,
		error: types.maybeNull(types.string),
	})
	.actions((self) => ({
		setError(error: string | null) {
			self.error = error;
		},
		setLoading(value: boolean) {
			self.loading = value;
		},
	}));

export const DataStore = types.model("DataStore", {
	items: types.array(types.model({ id: types.identifierNumber, title: types.string })),
});

export const ApiStore = types.compose("ApiStore", RequestStore, DataStore).actions((self) => ({
	load: flow(function* () {
		self.setLoading(true);
		self.setError(null);
		try {
			const response: Array<{ id: number; title: string }> = yield Promise.resolve([
				{ id: 1, title: "First" },
				{ id: 2, title: "Second" },
			]);
			self.items.replace(response);
		} catch (error) {
			self.setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			self.setLoading(false);
		}
	}),
}));

export const ExtendedApiStore = ApiStore.props({
	total: types.optional(types.number, 0),
}).views((self) => ({
	get isEmpty() {
		return self.items.length === 0;
	},
	get hasMore() {
		return self.items.length < self.total;
	},
}));

export type ExtendedApiStoreInstance = Instance<typeof ExtendedApiStore>;

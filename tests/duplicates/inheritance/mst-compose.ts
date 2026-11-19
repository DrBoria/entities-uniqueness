// MST — types.compose of three base stores + own props/views/actions.
import { types, Instance } from "mobx-state-tree";

export const BaseStore = types
	.model("BaseStore", {
		loading: types.optional(types.boolean, false),
		error: types.maybeNull(types.string),
	})
	.actions((self) => ({
		setLoading(value: boolean) {
			self.loading = value;
		},
		setError(value: string | null) {
			self.error = value;
		},
	}));

export const PaginationStore = types
	.model("PaginationStore", {
		page: types.optional(types.number, 1),
		pageSize: types.optional(types.number, 20),
	})
	.views((self) => ({
		get offset() {
			return (self.page - 1) * self.pageSize;
		},
	}))
	.actions((self) => ({
		nextPage() {
			self.page++;
		},
		previousPage() {
			self.page = Math.max(1, self.page - 1);
		},
	}));

export const SelectionStore = types
	.model("SelectionStore", {
		selectedIds: types.optional(types.array(types.string), []),
	})
	.views((self) => ({
		get hasSelection() {
			return self.selectedIds.length > 0;
		},
	}))
	.actions((self) => ({
		select(id: string) {
			if (!self.selectedIds.includes(id)) self.selectedIds.push(id);
		},
		clearSelection() {
			self.selectedIds.clear();
		},
	}));

export const UserStore = types
	.compose("UserStore", BaseStore, PaginationStore, SelectionStore)
	.props({
		users: types.optional(
			types.array(types.model({ id: types.identifier, name: types.string })),
			[]
		),
	})
	.views((self) => ({
		get selectedUsers() {
			return self.users.filter((user) => self.selectedIds.includes(user.id));
		},
	}))
	.actions((self) => ({
		addUser(name: string) {
			self.users.push({ id: String(Date.now()), name });
		},
	}));

export type UserStoreInstance = Instance<typeof UserStore>;

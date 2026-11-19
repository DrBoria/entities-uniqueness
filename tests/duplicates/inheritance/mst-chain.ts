// MST — sequential .props()/.views()/.actions() extension of one model.
import { types, Instance } from "mobx-state-tree";

export const Entity = types
	.model("Entity", {
		id: types.identifier,
		name: types.string,
	})
	.views((self) => ({
		get label() {
			return `Entity: ${self.name}`;
		},
	}))
	.actions((self) => ({
		rename(name: string) {
			self.name = name;
		},
	}));

export const AuditableEntity = Entity.props({
	createdAt: types.optional(types.Date, () => new Date()),
	updatedAt: types.optional(types.Date, () => new Date()),
})
	.views((self) => ({
		get auditInfo() {
			return { created: self.createdAt, updated: self.updatedAt, label: self.label };
		},
	}))
	.actions((self) => ({
		touch() {
			self.updatedAt = new Date();
		},
	}));

export const VersionedEntity = AuditableEntity.props({
	version: types.optional(types.number, 1),
	previousVersion: types.maybeNull(types.number),
}).actions((self) => ({
	incrementVersion() {
		self.previousVersion = self.version;
		self.version++;
		self.touch();
	},
}));

export const UserEntity = VersionedEntity.props({
	email: types.string,
	role: types.enumeration(["user", "admin", "moderator"]),
})
	.views((self) => ({
		get isAdmin() {
			return self.role === "admin";
		},
	}))
	.actions((self) => ({
		promote() {
			self.role = "admin";
			self.incrementVersion();
		},
	}));

export type UserEntityInstance = Instance<typeof UserEntity>;

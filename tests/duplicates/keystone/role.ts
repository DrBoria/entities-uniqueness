// Fixture mirroring md-starter/apps/_template-keystone/schema/Role.ts.
import { list } from "@keystone-6/core";
import { text } from "@keystone-6/core/fields";

const ALLOW_ROLES_MANAGEMENT = "allow";

export const Role = list({
	access: {
		operation: {
			query: () => true,
			create: () => false,
			update: (data) => ALLOW_ROLES_MANAGEMENT === "allow" || data.isAdmin,
			delete: () => false,
		},
		filter: {
			query: (context) => {
				if (ALLOW_ROLES_MANAGEMENT === "allow") return true;
				if (context.isAdmin) return true;
				return false;
			},
		},
	},
	db: {
		map: "role",
	},
	fields: {
		slug: text({
			validation: { isRequired: true },
			isIndexed: "unique",
		}),
		permissions: text({}),
	},
	ui: {
		label: "Role",
	},
});

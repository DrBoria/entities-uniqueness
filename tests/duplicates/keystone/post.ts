// Fixture mirroring md-starter/apps/_template-keystone/schema/Post.ts.
import { list } from "@keystone-6/core";
import { checkbox, text } from "@keystone-6/core/fields";

type PostWhereInput = Record<string, unknown>;

export const Post = list({
	access: {
		operation: {
			query: () => true,
			create: () => true,
			update: () => true,
			delete: () => true,
		},
		filter: {
			update: ({ session }) => session.isOwner,
			delete: ({ session }) => session.isOwner,
			query: ({ session }) => {
				if (session.isAdmin) return true;
				return { premium: { equals: false } } as PostWhereInput;
			},
		},
	},
	db: {
		map: "post",
	},
	fields: {
		name: text({
			validation: { isRequired: true },
			isIndexed: "unique",
		}),
		premium: checkbox({}),
		textContent: text({
			validation: { isRequired: true },
			db: { map: "text_content" },
		}),
		updatedAt: text({}),
		createdAt: text({}),
	},
	ui: {
		label: "Post",
	},
});

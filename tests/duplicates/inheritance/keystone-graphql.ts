// Keystone 6 — extendGraphqlSchema: g.extend with a custom object type,
// composed extensions, and reuse of a generated Keystone type.
import { config, g } from "@keystone-6/core";

type Context = { db: { User: { count(): Promise<number> }; Post: { count(w: unknown): Promise<number>; updateOne(a: unknown): Promise<unknown> } } };

const userExtensions = g.extend((base) => ({
	query: {
		userStatistics: g.field({
			type: g.Int,
			resolve(_source: unknown, _args: unknown, context: Context) {
				return context.db.User.count();
			},
		}),
	},
}));

const postExtensions = g.extend((base) => ({
	query: {
		publishedPostCount: g.field({
			type: g.Int,
			resolve(_source: unknown, _args: unknown, context: Context) {
				return context.db.Post.count({ where: { published: { equals: true } } });
			},
		}),
	},
}));

const publishExtension = g.extend((base) => ({
	mutation: {
		publishPost: g.field({
			type: base.object("Post"),
			args: { id: g.arg({ type: g.nonNull(g.ID) }) },
			resolve: async (_source: unknown, { id }: { id: string }, context: Context) => {
				return context.db.Post.updateOne({ where: { id }, data: { published: true } });
			},
		}),
	},
}));

export default config({
	db: { provider: "sqlite", url: "file:./dev.db" },
	lists: {},
	graphql: {
		extendGraphqlSchema: (schema) => publishExtension(postExtensions(userExtensions(schema))),
	},
});

// Keystone 6 — list-config factories sharing base/publish/author field sets.
import { list } from "@keystone-6/core";
import { text, timestamp, relationship, checkbox } from "@keystone-6/core/fields";

const baseFields = {
	title: text({ validation: { isRequired: true } }),
	slug: text({ isIndexed: "unique" }),
	createdAt: timestamp(),
	updatedAt: timestamp(),
};

const publishFields = {
	published: checkbox({ defaultValue: false }),
	publishedAt: timestamp(),
};

const authorFields = {
	author: relationship({ ref: "User.posts" }),
};

function createBaseList(additionalFields: Record<string, unknown> = {}) {
	return { fields: { ...baseFields, ...additionalFields } };
}

function createContentList(additionalFields: Record<string, unknown> = {}) {
	return { fields: { ...baseFields, ...publishFields, ...authorFields, ...additionalFields } };
}

export const Post = list(createContentList({ content: text({ ui: { displayMode: "textarea" } }) }));

export const News = list(createContentList({ excerpt: text(), category: text() }));

export const Page = list(createBaseList({ body: text({ ui: { displayMode: "textarea" } }), seoTitle: text() }));

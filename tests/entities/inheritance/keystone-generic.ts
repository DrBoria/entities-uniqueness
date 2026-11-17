// Keystone 6 — generic list-config factory with optional field groups.
import { list } from "@keystone-6/core";
import { text, timestamp, checkbox } from "@keystone-6/core/fields";

type FieldConfig = Record<string, unknown>;

interface ListOptions {
	fields?: FieldConfig;
	withPublishing?: boolean;
	withTimestamps?: boolean;
}

function createListConfig<T extends ListOptions>(options: T) {
	const fields: FieldConfig = {
		...(options.withTimestamps && { createdAt: timestamp(), updatedAt: timestamp() }),
		...(options.withPublishing && { published: checkbox({ defaultValue: false }), publishedAt: timestamp() }),
		...options.fields,
	};

	return { fields };
}

export const Article = list(
	createListConfig({
		withPublishing: true,
		withTimestamps: true,
		fields: { title: text(), body: text() },
	})
);

export const Category = list(
	createListConfig({
		withTimestamps: true,
		fields: { name: text(), description: text() },
	})
);

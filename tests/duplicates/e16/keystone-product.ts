import { list } from "@keystone-6/core";
import { checkbox, integer, text, timestamp } from "@keystone-6/core/fields";

// Keystone list config for the product catalog. The field set is the same
// domain shape as the class-validator ProductDto used by the public API.
export const ProductListing = list({
	fields: {
		sku: text({ validation: { isRequired: true } }),
		title: text({ validation: { isRequired: true } }),
		priceCents: integer({ validation: { isRequired: true } }),
		inStock: checkbox({ defaultValue: false }),
		description: text(),
		createdAt: timestamp(),
	},
});

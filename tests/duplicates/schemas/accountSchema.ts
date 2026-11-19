import { z } from "zod";

export const accountSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().optional(),
	age: z.number(),
	roles: z.array(z.string()),
});

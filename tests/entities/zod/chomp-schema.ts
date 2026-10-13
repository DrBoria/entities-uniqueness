import { type Infer, Tx, z } from "utils";

// Mirrors the chomp-2 pattern: zod imported from "utils", with chained calls,
// instanceof, nativeEnum, literal, uuidv4, custom, enum, record, coerce.

export const identitySchema = z.object({
	legalFirstName: z.string(),
	middleName: z.string().optional(),
	legalDateOfBirth: z.instanceof(Tx.Day).optional(),
	race: z.array(z.nativeEnum(RaceCategory)),
	sex: z.nativeEnum(Sex),
	ssn: z.string().optional(),
	photoUrl: z.string().url().optional(),
});
export type Identity = Infer<typeof identitySchema>;

export const addressSchema = z.object({
	line1: z.string(),
	line2: z.string().optional(),
	postalCode: z.string().regex(/^(\d{5}(-\d{4})?)?$/),
	effectiveStart: z.instanceof(Tx.Day).optional(),
});
export type Address = Infer<typeof addressSchema>;

export const vitalValueSchema = z.object({
	kind: z.literal("bloodPressure"),
	systolic: z.number().optional(),
	unit: z.string(),
});
export type VitalValue = Infer<typeof vitalValueSchema>;

export const patientIdSchema = z.object({
	patientId: z.uuidv4(),
});
export type PatientId = Infer<typeof patientIdSchema>;

export const filtersSchema = z.object({
	labels: z.record(z.string(), z.string()).optional(),
});
export type Filters = Infer<typeof filtersSchema>;

export const statusSchema = z.enum(["active", "inactive", "archived"]);
export type Status = Infer<typeof statusSchema>;

export const customSchema = z.object({
	date: z.custom<Tx.PlainDate>((v) => v instanceof Date),
});
export type Custom = Infer<typeof customSchema>;

export const coercedSchema = z.object({
	amount: z.coerce.number(),
});
export type Coerced = Infer<typeof coercedSchema>;

// chomp-2 pattern: array of a primitive zod call (not a schema variable).
export const assignmentSchema = z.object({
	careCircle: z.array(z.string()).optional(),
});
export type Assignment = Infer<typeof assignmentSchema>;

// chomp-2 pattern: array of an INLINE z.object (assignmentSchema in patient.v).
export const assignmentInlineSchema = z.object({
	careCircle: z
		.array(z.object({ name: z.string(), role: z.string().optional() }))
		.optional(),
});
export type AssignmentInline = Infer<typeof assignmentInlineSchema>;

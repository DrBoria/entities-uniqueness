import type { WebhookEvent } from "./base";

// Built ON TOP of WebhookEvent via intersection: legitimate reuse/extension,
// not a second copy of the base shape.
export type AuditedWebhookEvent = WebhookEvent & {
	auditedBy: string;
	auditedAt: number;
	reviewNotes: string;
};

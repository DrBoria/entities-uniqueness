// Almost the same closed set as InvoiceStatus — but with ONE extra member
// ("disputed"). Near-miss sets must not collapse into a duplicate verdict.
export type BillingState =
	| "draft"
	| "sent"
	| "paid"
	| "overdue"
	| "void"
	| "refunded"
	| "disputed";

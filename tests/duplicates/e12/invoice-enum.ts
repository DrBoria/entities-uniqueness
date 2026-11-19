// Invoice lifecycle statuses as a string enum.
export enum InvoiceStatus {
	Draft = "draft",
	Sent = "sent",
	Paid = "paid",
	Overdue = "overdue",
	Void = "void",
	Refunded = "refunded",
}

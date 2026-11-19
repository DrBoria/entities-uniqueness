// The same closed member set as ShipmentStatus, expressed as a string
// literal union in a completely different order.
export type ShipmentState =
	| "lost"
	| "delivered"
	| "created"
	| "out_for_delivery"
	| "packed"
	| "returned"
	| "in_transit"
	| "picked";

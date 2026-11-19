// Closed status set for shipments, declared as a string enum.
export enum ShipmentStatus {
	Created = "created",
	Picked = "picked",
	Packed = "packed",
	InTransit = "in_transit",
	OutForDelivery = "out_for_delivery",
	Delivered = "delivered",
	Returned = "returned",
	Lost = "lost",
}

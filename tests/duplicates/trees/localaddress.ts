// A strict subset of Address (street, city, zip) — an inclusion child.
export interface LocalAddress {
	street: string;
	city: string;
	zip: string;
}

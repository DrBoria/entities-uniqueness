// Biggest entity in the inclusion chain: Address ⊇ LocalAddress ⊇ CityZip.
export interface Address {
	street: string;
	city: string;
	zip: string;
	country: string;
}

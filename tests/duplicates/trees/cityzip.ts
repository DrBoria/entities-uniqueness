// A strict subset of BOTH LocalAddress and Address (city, zip) — the deepest
// node; the tree builder must attach it to its tightest parent (LocalAddress).
export interface CityZip {
	city: string;
	zip: string;
}

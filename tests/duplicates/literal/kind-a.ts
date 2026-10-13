// A discriminated-union shape whose `kind` is a set of string literals.
// Mirrors ActivityItem: kind is one of a specific set of values.
export interface KindA {
	kind: "comment" | "event";
	author: string;
	body: string;
}

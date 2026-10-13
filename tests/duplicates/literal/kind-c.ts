// Control: identical `kind` literal values to KindA ("comment"|"event").
// Same values must still count as full type agreement — the fix must not
// over-discount genuinely identical literal unions.
export interface KindC {
	kind: "comment" | "event";
	author: string;
	body: string;
}

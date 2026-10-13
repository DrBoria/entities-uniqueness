// Same shape as KindA (kind/author/body) but the `kind` literal values are a
// DISJOINT set — no value is shared with KindA. This mirrors
// ActivityItem.kind ("comment"|"event"|...) vs SlackMessage.kind ("human"|"bot"):
// the field name matches, but the types are semantically unrelated.
export interface KindB {
	kind: "human" | "bot";
	author: string;
	body: string;
}

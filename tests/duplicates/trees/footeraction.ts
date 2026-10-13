// Strict superset of `actions` by UNIQUE names ({key,label,onClick,icon} ⊇
// {key,label,onClick}) but SMALLER by raw properties.length (4 < 6, because
// `actions` repeats its three members twice). The decision maker must orient
// parent/child by the unique-name set, so FooterAction is the parent.
export interface FooterAction {
	key: string;
	label: string;
	onClick: () => void;
	icon: string;
}

// Fixture in the style of @apollo/client generated types: `export type
// FooQuery = { ... }` object-literal aliases, one of which is a copy.
interface TokenData {
	idToken: string | null;
	accessToken: string | null;
	expirationTime: number;
}

export type TokenQuery = {
	user: {
		id: string;
		email: string;
		tokens: TokenData;
	};
	timestamp: number;
	refresh: boolean;
};

// A copy of TokenQuery's shape under a second name.
export type TokenQueryCopy = {
	user: {
		id: string;
		email: string;
		tokens: TokenData;
	};
	timestamp: number;
	refresh: boolean;
};

export const hasTokenExpired = (tokens: TokenData) => tokens.expirationTime < Date.now();

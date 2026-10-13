// Mirrors FaqA's names, but `answer` is a number — type mismatch on a shared
// field. Pair with FaqA is an intersection whose score must be < 1.0.
export interface FaqB {
	question: string;
	answer: number;
}

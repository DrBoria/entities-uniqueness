// Same name set as FaqB but `answer` is a different type (string vs number) —
// a type-mismatched intersection. The extract score must drop below 1.0.
export interface FaqA {
	question: string;
	answer: string;
}

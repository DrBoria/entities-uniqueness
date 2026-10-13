export interface PaymentGateway {
	provider: string;
	amount: number;
	currency: string;
	authorize(token: string): boolean;
	refund(refId: string): boolean;
}

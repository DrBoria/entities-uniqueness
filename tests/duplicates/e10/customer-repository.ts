// Plain repository: identical method set to InternalCustomerRepository
// without the `internalRepository` prefix on every name.
export class CustomerRepository {
	fetchCustomer(customerId: string): Promise<string> {
		return Promise.resolve(customerId);
	}

	updateCustomer(customerId: string, email: string): Promise<void> {
		void customerId;
		void email;
		return Promise.resolve();
	}

	deleteCustomer(customerId: string): Promise<void> {
		void customerId;
		return Promise.resolve();
	}

	listCustomers(pageSize: number): Promise<string[]> {
		return Promise.resolve([String(pageSize)]);
	}

	countCustomers(): Promise<number> {
		return Promise.resolve(0);
	}

	searchCustomers(query: string): Promise<string[]> {
		return Promise.resolve([query]);
	}
}

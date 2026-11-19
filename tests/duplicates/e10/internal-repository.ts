// Repository whose every method carries a long ceremony prefix. The method
// set is exactly CustomerRepository's set modulo the `internalRepository`
// prefix — same operations, same parameters.
export class InternalCustomerRepository {
	internalRepositoryFetchCustomer(customerId: string): Promise<string> {
		return Promise.resolve(customerId);
	}

	internalRepositoryUpdateCustomer(customerId: string, email: string): Promise<void> {
		void customerId;
		void email;
		return Promise.resolve();
	}

	internalRepositoryDeleteCustomer(customerId: string): Promise<void> {
		void customerId;
		return Promise.resolve();
	}

	internalRepositoryListCustomers(pageSize: number): Promise<string[]> {
		return Promise.resolve([String(pageSize)]);
	}

	internalRepositoryCountCustomers(): Promise<number> {
		return Promise.resolve(0);
	}

	internalRepositorySearchCustomers(query: string): Promise<string[]> {
		return Promise.resolve([query]);
	}
}

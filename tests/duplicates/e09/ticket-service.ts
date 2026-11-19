// Ticketing service client. Every method name is one letter away from the
// corresponding method in TicketFacade (single mid-name substitution).
export class TicketService {
	apiBase: string = "https://tickets.internal.example";
	timeoutMs: number = 4000;

	fetchTicket(ticketId: string): Promise<string> {
		return Promise.resolve(`${this.apiBase}/tickets/${ticketId}`);
	}

	updateTicket(ticketId: string, subject: string): Promise<void> {
		void ticketId;
		void subject;
		return Promise.resolve();
	}

	deleteTicket(ticketId: string): Promise<void> {
		void ticketId;
		return Promise.resolve();
	}

	listTickets(queueId: string): Promise<string[]> {
		return Promise.resolve([queueId]);
	}

	assignTicket(ticketId: string, agentId: string): Promise<void> {
		void ticketId;
		void agentId;
		return Promise.resolve();
	}

	escalateTicket(ticketId: string, tier: number): Promise<void> {
		void ticketId;
		void tier;
		return Promise.resolve();
	}

	closeTicket(ticketId: string, resolution: string): Promise<void> {
		void ticketId;
		void resolution;
		return Promise.resolve();
	}

	reopenTicket(ticketId: string): Promise<void> {
		void ticketId;
		return Promise.resolve();
	}
}

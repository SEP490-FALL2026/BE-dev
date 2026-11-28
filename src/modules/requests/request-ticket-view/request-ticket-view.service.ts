import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { TicketWire } from '../request-ticket/request-ticket.dto';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import { toTicketWire } from '../request-ticket/request-ticket.mapper';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { RequestReadAccessService } from '../request-view/request-read-access.service';

/**
 * Ticket detail reader: returns the ticket with only the items the caller may read, while preserving ticket-wide status.
 * Lock order: read-only service, acquires no row locks.
 */
@Injectable()
export class RequestTicketViewService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly tickets: RequestTicketRepo,
    private readonly requests: AccessRequestRepo,
    private readonly readAccess: RequestReadAccessService,
  ) {}

  async get(actor: AuthenticatedPrincipal, ticketId: string): Promise<TicketWire> {
    const ticketView = await this.runner.run((tx) => this.tickets.view(tx, ticketId));
    if (!ticketView) throw new RequestTicketNotFoundError();

    const records = await this.requests.findByIds(ticketView.items.map((item) => item.requestId));
    const visibleIds = new Set<string>();

    for (const record of records) {
      const access = await this.readAccess.accessOf(actor, {
        ...viewFactsOf(record),
        id: record.id,
        isGroup: record.type === 'GROUP_GRANT',
        departmentId: record.departmentId,
      });
      if (access.read) visibleIds.add(record.id);
    }

    if (visibleIds.size === 0) throw new RequestTicketNotFoundError();

    return toTicketWire(ticketView, visibleIds);
  }
}

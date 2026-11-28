import { Injectable } from '@nestjs/common';
import { TransactionRunner, TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { WithdrawalRefusal } from '../access-request/withdrawal.policy';
import type { TicketWithdrawResultWire } from '../request-ticket/request-ticket.dto';
import { RequestTicketNotFoundError, RequestTicketNotRequesterError } from '../request-ticket/request-ticket.errors';
import { orderByPosition } from '../request-ticket/request-ticket.policy';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { RequestReadAccessService } from '../request-view/request-read-access.service';
import { WithdrawalService } from './withdrawal.service';

type SkippableWithdrawalRefusal = Exclude<WithdrawalRefusal, 'NOT_REQUESTER' | 'REASON_REQUIRED'>;

function toSkippableReason(reason: WithdrawalRefusal): SkippableWithdrawalRefusal | null {
  switch (reason) {
    case 'WITHDRAWAL_AFTER_DECISION':
    case 'ALREADY_ENDED':
    case 'WITHDRAWAL_PENDING':
    case 'GRANT_RUNNING':
    case 'GRANT_COMPLETED':
      return reason;
    default:
      return null;
  }
}

/**
 * Withdraws a whole request ticket on behalf of its requester.
 *
 * Lock order: reads ticket item membership and request records in a lock-free read transaction, then withdraws each item
 * sequentially in ascending `position` order, one transaction per item via `WithdrawalService.withdraw` (grant task at
 * level 3a -> access request at level 4; no ticket lock).
 */
@Injectable()
export class TicketWithdrawalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly tickets: RequestTicketRepo,
    private readonly requests: AccessRequestRepo,
    private readonly readAccess: RequestReadAccessService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  /** Throws RequestTicketNotFoundError and RequestTicketNotRequesterError. */
  async withdraw(
    actor: AuthenticatedPrincipal,
    ticketId: string,
    input: { reason?: string },
  ): Promise<TicketWithdrawResultWire[]> {
    const { ordered, byId } = await this.loadTicketItems(actor, ticketId);
    const results: TicketWithdrawResultWire[] = [];

    for (const item of ordered) {
      const existing = byId.get(item.requestId);
      if (existing?.state === 'WITHDRAWN' && existing.withdrawal?.requestedByEmployeeId === actor.employeeId) {
        results.push({ requestId: item.requestId, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' });
        continue;
      }
      results.push(await this.withdrawOne(actor, item.requestId, input));
    }

    return results;
  }

  private async loadTicketItems(actor: AuthenticatedPrincipal, ticketId: string) {
    const { items, records } = await this.runner.run(async (tx) => {
      const items = await this.tickets.itemsOf(tx, ticketId);
      if (items.length === 0) return { items, records: [] as AccessRequestRecord[] };
      const records = await this.requests.findByIds(
        items.map((item) => item.requestId),
        tx,
      );

      return { items, records };
    });

    if (items.length === 0 || records.length === 0) throw new RequestTicketNotFoundError();
    const visibleIds = await this.readAccess.visibleItemIds(actor, records);
    if (visibleIds.size === 0) {
      throw new RequestTicketNotFoundError();
    }
    if (records[0].requesterEmployeeId !== actor.employeeId) {
      throw new RequestTicketNotRequesterError();
    }

    return {
      ordered: orderByPosition(items),
      byId: new Map(records.map((record) => [record.id, record])),
    };
  }

  private async withdrawOne(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { reason?: string },
  ): Promise<TicketWithdrawResultWire> {
    try {
      await this.withdrawals.withdraw(actor, requestId, input);

      return { requestId, outcome: 'WITHDRAWN', reason: null };
    } catch (error) {
      if (error instanceof TransientDatabaseError) {
        return { requestId, outcome: 'RETRYABLE', reason: 'TRANSIENT_FAILURE' };
      }
      if (error instanceof AccessRequestNotFoundError) {
        return { requestId, outcome: 'SKIPPED', reason: 'NOT_IN_TICKET' };
      }
      if (error instanceof AccessRequestWithdrawalRefusedError) {
        const reason = toSkippableReason(error.reason);
        if (reason) return { requestId, outcome: 'SKIPPED', reason };
      }
      throw error;
    }
  }
}

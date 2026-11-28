import { Injectable } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { WithdrawalRefusal } from '../access-request/withdrawal.policy';
import type { TicketWithdrawResultWire } from '../request-ticket/request-ticket.dto';
import { RequestTicketNotRequesterError } from '../request-ticket/request-ticket.errors';
import { RequestReadAccessService } from '../request-view/request-read-access.service';
import { WithdrawalService } from './withdrawal.service';

type SkippableReason =
  | 'WITHDRAWAL_AFTER_DECISION'
  | 'ALREADY_ENDED'
  | 'WITHDRAWAL_PENDING'
  | 'GRANT_RUNNING'
  | 'GRANT_COMPLETED'
  | 'NOT_IN_TICKET';

function toSkippableReason(reason: WithdrawalRefusal): SkippableReason {
  switch (reason) {
    case 'WITHDRAWAL_AFTER_DECISION':
    case 'ALREADY_ENDED':
    case 'WITHDRAWAL_PENDING':
    case 'GRANT_RUNNING':
    case 'GRANT_COMPLETED':
      return reason;
    case 'REASON_REQUIRED':
      return 'WITHDRAWAL_AFTER_DECISION';
    case 'NOT_REQUESTER':
      return 'NOT_IN_TICKET';
  }
}

/**
 * Withdraws a whole request ticket on behalf of its requester.
 *
 * Lock order: reads ticket membership and visibility in one read transaction via `readAccess.visibleTicket`, then
 * withdraws each item sequentially in ascending `position` order, one transaction per item via
 * `WithdrawalService.withdraw` (grant task at level 3a -> access request at level 4; no ticket lock).
 */
@Injectable()
export class TicketWithdrawalService {
  constructor(
    private readonly readAccess: RequestReadAccessService,
    private readonly requests: AccessRequestRepo,
    private readonly withdrawals: WithdrawalService,
  ) {}

  /** Throws RequestTicketNotFoundError and RequestTicketNotRequesterError. */
  async withdraw(
    actor: AuthenticatedPrincipal,
    ticketId: string,
    input: { reason?: string },
  ): Promise<TicketWithdrawResultWire[]> {
    const { ticket, items } = await this.readAccess.visibleTicket(actor, ticketId);
    if (ticket.requesterEmployeeId !== actor.employeeId) {
      throw new RequestTicketNotRequesterError();
    }

    const results: TicketWithdrawResultWire[] = [];
    for (const item of items) {
      results.push(await this.withdrawOne(actor, item.requestId, input));
    }
    return results;
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
        return this.mapRefusal(actor, requestId, error.reason);
      }
      throw error;
    }
  }

  private async mapRefusal(
    actor: AuthenticatedPrincipal,
    requestId: string,
    reason: WithdrawalRefusal,
  ): Promise<TicketWithdrawResultWire> {
    if (reason === 'ALREADY_ENDED') {
      const latest = await this.requests.findById(requestId);
      if (latest?.state === 'WITHDRAWN' && latest.withdrawal?.requestedByEmployeeId === actor.employeeId) {
        return { requestId, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' };
      }
    }
    return { requestId, outcome: 'SKIPPED', reason: toSkippableReason(reason) };
  }
}

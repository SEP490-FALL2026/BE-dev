import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { HumanReturn } from '../request-reply/request-reply.types';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { TicketRef } from '../request-ticket/request-ticket.types';

/** Ticket reference and human-return reply helpers used across spend queue and batch submission. */
@Injectable()
export class SpendTicketReplyService {
  constructor(
    private readonly tickets: RequestTicketRepo,
    private readonly replies: RequestReplyRepo,
  ) {}

  refsOf(requestIds: readonly string[]): Promise<Map<string, TicketRef>> {
    return this.tickets.refsOf(requestIds);
  }

  spendReturnsAwaitingReply(requestIds: readonly string[]): Promise<Set<string>> {
    return this.replies.spendReturnsAwaitingReply(requestIds);
  }

  async pendingSpendReturn(tx: DbTx, requestId: string): Promise<HumanReturn | null> {
    return (await this.replies.pendingSpendReturnsOf([requestId], tx)).get(requestId) ?? null;
  }

  recordHeadResubmission(
    tx: DbTx,
    input: {
      organizationId: string;
      requestId: string;
      returnedStepId: string;
      note: string;
      authorEmployeeId: string;
    },
  ): Promise<{ id: string }> {
    return this.replies.insert(tx, { ...input, kind: 'HEAD_RESUBMISSION' });
  }
}

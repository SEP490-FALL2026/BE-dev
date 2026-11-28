import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pendingSpendReturn } from '../request-reply/request-reply.policy';
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

  async spendReturnsAwaitingReply(requestIds: readonly string[]): Promise<Set<string>> {
    const factsByRequest = await this.replies.returnFactsOf(requestIds);
    const awaiting = new Set<string>();
    for (const [requestId, facts] of factsByRequest) {
      if (pendingSpendReturn(facts)) awaiting.add(requestId);
    }
    return awaiting;
  }

  async pendingSpendReturn(tx: DbTx, requestId: string): Promise<HumanReturn | null> {
    const facts = (await this.replies.returnFactsOf([requestId], tx)).get(requestId);
    return facts ? pendingSpendReturn(facts) : null;
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

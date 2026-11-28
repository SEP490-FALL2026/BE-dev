import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pendingSpendReturn } from '../request-reply/request-reply.policy';
import { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { HumanReturn } from '../request-reply/request-reply.types';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { TicketRef } from '../request-ticket/request-ticket.types';

/** Shared batch reader for ticket references and pending spend human returns across spend queue, batch, and view. */
@Injectable()
export class SpendReplyFactsService {
  constructor(
    private readonly tickets: RequestTicketRepo,
    private readonly replies: RequestReplyRepo,
  ) {}

  refsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, TicketRef>> {
    return tx ? this.tickets.refsOf(requestIds, tx) : this.tickets.refsOf(requestIds);
  }

  async pendingSpendReturnsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, HumanReturn>> {
    const factsByRequest = tx
      ? await this.replies.returnFactsOf(requestIds, tx)
      : await this.replies.returnFactsOf(requestIds);
    const pending = new Map<string, HumanReturn>();
    for (const [requestId, facts] of factsByRequest) {
      const hit = pendingSpendReturn(facts);
      if (hit) pending.set(requestId, hit);
    }
    return pending;
  }

  async spendReturnsAwaitingReply(requestIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return new Set((await this.pendingSpendReturnsOf(requestIds, tx)).keys());
  }
}

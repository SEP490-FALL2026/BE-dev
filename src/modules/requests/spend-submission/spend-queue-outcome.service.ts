import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { BlockReason, BudgetOutcome } from '../spend/budget-check.policy';
import { BudgetCheckService } from '../spend/budget-check.service';

/** What a check made now says of a request, as far as the head needs it to send it on: the outcome, why it is blocked, how far over. */
export interface ExpectedOutcome {
  outcome: BudgetOutcome;
  blockedReasons: BlockReason[];
  /** Over the reserve when that is why it is blocked, otherwise over the base; null when it is not over. */
  overByMinor: bigint | null;
  currency: string;
}

/**
 * What a check made now would say of each request of the queue of the head (`RV-11`), in memory only: nothing is written and no lock is
 * taken. It is how the head knows which request needs a line of reason to be sent on, and which would be blocked.
 */
@Injectable()
export class SpendQueueOutcomeService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckService,
  ) {}

  async expectedFor(ids: readonly string[]): Promise<Map<string, ExpectedOutcome>> {
    const found = new Map<string, ExpectedOutcome>();
    if (ids.length === 0) return found;
    await this.runner.run(async (tx) => {
      for (const id of ids) {
        const request = await this.requests.findById(id, tx);
        if (!request) continue;
        const computed = await this.checks.compute(tx, request, new Date(), undefined, 'SUBMISSION');
        if (computed.status !== 'COMPUTED') continue;
        const { result } = computed;
        found.set(id, {
          outcome: result.outcome,
          blockedReasons: result.blockReasons,
          overByMinor: result.overByMinor ?? result.overBaseByMinor,
          currency: computed.currency,
        });
      }
    });

    return found;
  }
}

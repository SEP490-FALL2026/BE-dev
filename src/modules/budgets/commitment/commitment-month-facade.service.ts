import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { remainingOfSlice } from './month/commitment-month.policy';
import {
  CommitmentMonthService,
  type CommitmentMonthRecord,
  type SettlementPassResult,
} from './month/commitment-month.service';

export { remainingOfSlice };
export type { CommitmentMonthRecord };

/**
 * Capability-root facade for sibling capabilities (`seat-month`) to access monthly K2 slices and month-end settlement
 * without reaching into private `commitment/month/` internals.
 */
@Injectable()
export class CommitmentMonthFacadeService {
  constructor(private readonly monthly: CommitmentMonthService) {}

  lockOfCommitment(tx: DbTx, commitmentId: string): Promise<CommitmentMonthRecord[]> {
    return this.monthly.lockOfCommitment(tx, commitmentId);
  }

  addApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    return this.monthly.addApplied(tx, commitmentId, month, deltaMinor);
  }

  reverseApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    return this.monthly.reverseApplied(tx, commitmentId, month, deltaMinor);
  }

  runPass(input: {
    organizationId: string;
    today: BusinessDate;
    now: Date;
    readyMonths: readonly BusinessDate[];
    priorDecemberReady?: boolean;
  }): Promise<SettlementPassResult> {
    return this.monthly.runPass(input);
  }
}

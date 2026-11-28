import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { MonthSliceDraft } from './commitment-month.policy';
import { CommitmentMonthRepo, type CommitmentMonthRecord } from './commitment-month.repo';
import { CommitmentMonthSettlementService, type SettlementPassResult } from './commitment-month-settlement.service';

export type { CommitmentMonthRecord, SettlementPassResult };

/**
 * Group entry for `budgets/commitment/month/` exposing monthly commitment slice persistence and settlement.
 */
@Injectable()
export class CommitmentMonthService {
  constructor(
    private readonly repo: CommitmentMonthRepo,
    private readonly settlements: CommitmentMonthSettlementService,
  ) {}

  insertMany(tx: DbTx, rows: readonly MonthSliceDraft[]): Promise<void> {
    return this.repo.insertMany(tx, rows);
  }

  lockOfCommitment(tx: DbTx, commitmentId: string): Promise<CommitmentMonthRecord[]> {
    return this.repo.lockOfCommitment(tx, commitmentId);
  }

  addApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    return this.repo.addApplied(tx, commitmentId, month, deltaMinor);
  }

  reverseApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    return this.repo.reverseApplied(tx, commitmentId, month, deltaMinor);
  }

  addReleased(
    tx: DbTx,
    commitmentId: string,
    month: BusinessDate,
    deltaMinor: bigint,
    settledAt?: Date,
  ): Promise<void> {
    return this.repo.addReleased(tx, commitmentId, month, deltaMinor, settledAt);
  }

  runPass(input: {
    organizationId: string;
    today: BusinessDate;
    now: Date;
    readyMonths: readonly BusinessDate[];
    priorDecemberReady?: boolean;
  }): Promise<SettlementPassResult> {
    return this.settlements.runPass(input);
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PendingSpendContributions,
  type PendingSpendContribution,
} from '../../budgets/public/budgets.extension-points';
import { BudgetCheckRepo } from './budget-check.repo';

/**
 * Tells the budgets what waits to be decided as spend in a Cost Center and a year (`BR-MF1-06f`, RV-10): the requests whose newest check is
 * within the base or uses the reserve (confirmed or not) and that have no decision yet, never a blocked one (M-05). The definition is the one
 * of `BudgetCheckRepo.pendingFor`, which the check of a request counts with, so the budgets and the check never disagree. It adds itself to the
 * budgets' contributions when the module starts, so the budgets never import this module (ADR-0016).
 */
@Injectable()
export class PendingSpendListener implements PendingSpendContribution, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PendingSpendContributions] as const;

  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly contributions: PendingSpendContributions,
  ) {}

  onModuleInit(): void {
    this.contributions.add('requests.pending-spend', this);
  }

  pendingOf(costCenterId: string, year: number, exceptRequestId: string | null, tx?: DbTx): Promise<bigint> {
    return this.checks.pendingFor(costCenterId, year, exceptRequestId, tx);
  }

  pendingMany(pairs: readonly { costCenterId: string; year: number }[], tx?: DbTx): Promise<Map<string, bigint>> {
    return this.checks.pendingMany(pairs, tx);
  }
}

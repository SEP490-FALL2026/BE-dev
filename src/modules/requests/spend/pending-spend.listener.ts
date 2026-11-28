import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PendingSpendContributions,
  type PendingSpendContribution,
} from '../../budgets/public/budgets.extension-points';
import { BudgetCheckRepo } from './budget-check.repo';

/**
 * Tells the budgets what waits to be decided as spend in a Cost Center and a year (`BR-MF1-06f`, RV-10): the requests whose newest check is
 * within the base or uses the reserve (confirmed or not, unless a spending approver returned the request after that check per `QĐ-117k`(2))
 * and that have no decision yet, never a blocked one (M-05). Budgets continue to use `BudgetCheckRepo.pendingFor`/`pendingMany`; only
 * item-level checks (`pendingForItem`, `QĐ-117k`(1)) exempt earlier unconfirmed items of the same ticket so later ticket items are not
 * blocked, meaning budget screens may temporarily report negative remaining. Adds itself when the module starts so budgets never
 * import this module (ADR-0016).
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

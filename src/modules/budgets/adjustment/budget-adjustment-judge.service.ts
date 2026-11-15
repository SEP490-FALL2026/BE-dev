import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import type { CycleRecord } from '../cycle/cycle.repo';
import { BudgetReviewFiguresService } from '../review/budget-review-figures.service';
import {
  BudgetAdjustmentBelowForecastError,
  BudgetAdjustmentNoBudgetError,
  BudgetAdjustmentOverBaseError,
  BudgetAdjustmentOverUnallocatedError,
  BudgetAdjustmentShapeError,
} from './budget-adjustment.errors';
import { judgeAdjustment, shapeRefusalOf, unallocatedOf } from './budget-adjustment.policy';
import type { AdjustmentShape, CostCenterPosition } from './budget-adjustment.types';

/**
 * Whether an adjustment may be made on the figures of now, asked when Finance makes it and again when the spending approver decides it, so that what was true on the first
 * day is not taken for granted on the second (`QĐ-111ag`). The figures are read in the transaction of the caller, which holds the lock of the cycle and of the year of each
 * Cost Center the adjustment names; the rules are the pure ones of `budget-adjustment.policy.ts`, and the forecast of the end of the year is the one of the review (`RV-1`).
 */
@Injectable()
export class BudgetAdjustmentJudgeService {
  constructor(
    private readonly budgets: BudgetFactsRepo,
    private readonly figures: BudgetReviewFiguresService,
  ) {}

  /** What of the annual ceiling is not allocated now. */
  async unallocatedOf(tx: DbTx, cycle: CycleRecord): Promise<bigint> {
    return unallocatedOf({
      annualCeilingMinor: cycle.annualCeilingMinor,
      sharedPoolReserveMinor: cycle.sharedPoolReserveMinor,
      allocatedMinor: await this.budgets.allocatedOfYear(cycle.organizationId, cycle.year, tx),
    });
  }

  /** Throws BudgetAdjustmentShapeError, BudgetAdjustmentOverUnallocatedError, BudgetAdjustmentOverBaseError, BudgetAdjustmentBelowForecastError, BudgetAdjustmentNoBudgetError. */
  async require(tx: DbTx, cycle: CycleRecord, shape: AdjustmentShape, today: BusinessDate): Promise<void> {
    const refusal = shapeRefusalOf(shape);
    if (refusal !== null) throw new BudgetAdjustmentShapeError(refusal);
    const verdict = judgeAdjustment({
      shape,
      unallocatedMinor: await this.unallocatedOf(tx, cycle),
      from: await this.positionOf(tx, cycle.year, shape.fromCostCenterId, today),
    });
    switch (verdict.kind) {
      case 'OK':
        return;
      case 'OVER_UNALLOCATED':
        throw new BudgetAdjustmentOverUnallocatedError(verdict.availableMinor, shape.amountMinor);
      case 'BELOW_FORECAST_FLOOR':
        throw new BudgetAdjustmentBelowForecastError(verdict.costCenterId, verdict.floorMinor, verdict.afterMinor);
      case 'OVER_BASE':
        throw new BudgetAdjustmentOverBaseError(verdict.costCenterId, verdict.baseMinor);
      case 'NO_BUDGET':
        throw new BudgetAdjustmentNoBudgetError(verdict.costCenterId);
    }
  }

  /** The effective budget and the forecast of the Cost Center that gives; null when it has no budget of the year. */
  private async positionOf(
    tx: DbTx,
    year: number,
    costCenterId: string | null,
    today: BusinessDate,
  ): Promise<CostCenterPosition | null> {
    if (costCenterId === null) return null;
    const budget = (await this.budgets.approvedOfCostCenters([costCenterId], year, tx)).get(costCenterId);
    if (!budget) return null;
    const forecast = (await this.figures.forecastsOf(tx, year, [costCenterId], today)).get(costCenterId) ?? 0n;

    return { baseMinor: budget.baseMinor, reserveMinor: budget.reserveMinor, forecastMinor: forecast };
  }
}

import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import type { CycleRecord } from '../cycle/cycle.repo';
import { BudgetReviewFiguresService } from '../review/budget-review-figures.service';
import {
  BudgetAdjustmentBelowForecastError,
  BudgetAdjustmentBudgetInPreparationError,
  BudgetAdjustmentNoBudgetError,
  BudgetAdjustmentOverBaseError,
  BudgetAdjustmentOverRemainingError,
  BudgetAdjustmentOverUnallocatedError,
  BudgetAdjustmentShapeError,
  BudgetAdjustmentVersionInFlightError,
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
    private readonly facts: BudgetFactsService,
    private readonly figures: BudgetReviewFiguresService,
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
  ) {}

  /** What of the annual ceiling is not allocated now. */
  async unallocatedOf(tx: DbTx, cycle: CycleRecord): Promise<bigint> {
    return unallocatedOf({
      annualCeilingMinor: cycle.annualCeilingMinor,
      sharedPoolReserveMinor: cycle.sharedPoolReserveMinor,
      allocatedMinor: await this.budgets.allocatedOfYear(cycle.organizationId, cycle.year, tx),
    });
  }

  /**
   * Throws BudgetAdjustmentShapeError, FinanceSetupIncompleteError (the Cost Center that receives was retired), BudgetAdjustmentVersionInFlightError,
   * BudgetAdjustmentBudgetInPreparationError, BudgetAdjustmentOverUnallocatedError, BudgetAdjustmentOverBaseError, BudgetAdjustmentBelowForecastError,
   * BudgetAdjustmentNoBudgetError.
   */
  async require(tx: DbTx, cycle: CycleRecord, shape: AdjustmentShape, today: BusinessDate): Promise<void> {
    const refusal = shapeRefusalOf(shape);
    if (refusal !== null) throw new BudgetAdjustmentShapeError(refusal);
    await this.requireReceiverReady(tx, cycle.year, shape.toCostCenterId);
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
      case 'OVER_REMAINING':
        throw new BudgetAdjustmentOverRemainingError(verdict.costCenterId, verdict.remainingMinor, verdict.usedMinor);
      case 'NO_BUDGET':
        throw new BudgetAdjustmentNoBudgetError(verdict.costCenterId);
    }
  }

  /**
   * The Cost Center that receives is one in use (`QĐ-87d`(1), `FIX-AD1` AD1-04): money given to a retired one sits where no Request is charged; the one that gives may be retired, since
   * it is what a department that changed its Cost Center gives from. A Cost Center that receives money and has no budget of the year is given the version of origin `ADJUSTMENT` when
   * the adjustment is approved (`R-48`): that is for a Cost Center that has nothing in the making. One whose version is being decided waits for that decision, and one whose `BM-10` waits for Finance gets its version from the proposal; an
   * adjustment that made the version first would leave the proposal with nothing to be built into (`BUDGET.CURRENT_EXISTS` for the whole year, `FIX-AD1` AD1-01).
   */
  private async requireReceiverReady(tx: DbTx, year: number, costCenterId: string | null): Promise<void> {
    if (costCenterId === null) return;
    await this.facts.costCenterInUse(costCenterId, tx);
    if ((await this.versions.reference(costCenterId, year, tx)) !== null) return;
    if ((await this.versions.inFlight(costCenterId, year, tx)) !== null) {
      throw new BudgetAdjustmentVersionInFlightError(costCenterId);
    }
    if ((await this.proposals.openOfCostCenters([costCenterId], year, tx)).size > 0) {
      throw new BudgetAdjustmentBudgetInPreparationError(costCenterId);
    }
  }

  /** The effective budget, what it used and the forecast of the Cost Center that gives; null when it has no budget of the year. */
  private async positionOf(
    tx: DbTx,
    year: number,
    costCenterId: string | null,
    today: BusinessDate,
  ): Promise<CostCenterPosition | null> {
    if (costCenterId === null) return null;
    const budget = (await this.budgets.yearFacts(costCenterId, [year], tx)).get(year);
    if (!budget) return null;
    const forecast = (await this.figures.forecastsOf(tx, year, [costCenterId], today)).get(costCenterId) ?? 0n;

    return {
      baseMinor: budget.baseMinor,
      reserveMinor: budget.reserveMinor,
      usedMinor: budget.heldMinor + budget.spentMinor,
      forecastMinor: forecast,
    };
  }
}

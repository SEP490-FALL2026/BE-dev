import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { VersionRepo } from '../budget/version.repo';
import { CycleRepo, type CycleRecord } from '../cycle/cycle.repo';
import { ThresholdAlertService } from '../threshold/threshold-alert.service';
import { VersionAdjustmentCreationService } from '../version/version-adjustment-creation.service';
import type { AdjustmentRecord } from './budget-adjustment.repo';
import { BudgetAdjustmentJudgeService } from './budget-adjustment-judge.service';

/**
 * What an approval does to the budget (`QĐ-111ag`, `R-48`), in the transaction of the decision that holds the locks of the cycle and of the year of each Cost Center. Every
 * condition is looked at again on the figures of today. A reduction of the ceiling lowers the annual ceiling of the cycle; the other kinds change nothing stored on the Cost
 * Centers, since the effective budget is the approved version with the adjustments approved for it, except that a Cost Center that receives money and has no budget of the
 * year is given the approved version of origin `ADJUSTMENT` (its id is what the adjustment keeps, so that the amount is counted once).
 */
@Injectable()
export class BudgetAdjustmentApplyService {
  constructor(
    private readonly judge: BudgetAdjustmentJudgeService,
    private readonly cycles: CycleRepo,
    private readonly versions: VersionRepo,
    private readonly versionMaker: VersionAdjustmentCreationService,
    private readonly thresholds: ThresholdAlertService,
    private readonly audit: AuditApi,
  ) {}

  /**
   * The id of the version made for the Cost Center that receives, or null when none was needed. Throws every refusal of `BudgetAdjustmentJudgeService.require`, which holds the
   * ones about the Cost Center that receives (a version still being decided, a proposal that waits).
   */
  async apply(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    cycle: CycleRecord,
    adjustment: AdjustmentRecord,
    today: BusinessDate,
    now: Date,
  ): Promise<string | null> {
    await this.judge.require(tx, cycle, adjustment, today);
    if (adjustment.kind === 'CEILING_REDUCTION') {
      await this.lowerCeiling(tx, actor, cycle, adjustment);

      return null;
    }
    const receiver = adjustment.toCostCenterId;
    if (receiver === null || (await this.versions.reference(receiver, adjustment.year, tx)) !== null) return null;

    // The version takes the commitments that waited for a budget (R-48): the use of the Cost Center now counts them against a base that did not exist, which is the one change
    // of the use an approval makes, and so the one place it tells a threshold (`RV-2`). The base of another adjustment of a Cost Center that has a budget moves no use and tells nothing (R-28).
    const watch = await this.thresholds.watch(tx, [{ costCenterId: receiver, year: adjustment.year }]);
    const versionId = await this.versionMaker.make(tx, actor, {
      organizationId: adjustment.organizationId,
      costCenterId: receiver,
      year: adjustment.year,
      amountMinor: adjustment.amountMinor,
      currency: adjustment.currency,
      madeByEmployeeId: adjustment.createdByEmployeeId,
      now,
    });
    await this.thresholds.settle(tx, watch, now);

    return versionId;
  }

  /** Lowers the annual ceiling of the cycle and keeps the ceiling before and after in the trail of the cycle, with the adjustment that moved it (US-06-20: Audit Trail). */
  private async lowerCeiling(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    cycle: CycleRecord,
    adjustment: AdjustmentRecord,
  ): Promise<void> {
    const lowered = cycle.annualCeilingMinor - adjustment.amountMinor;
    await this.cycles.update(tx, cycle.id, { annualCeilingMinor: lowered });
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        cycle.organizationId,
        'BUDGET_CYCLE.UPDATED',
        'BudgetCycle',
        cycle.id,
        {
          year: cycle.year,
          annualCeilingMinor: lowered.toString(),
          adjustmentId: adjustment.id,
          reason: adjustment.reason,
        },
        { year: cycle.year, annualCeilingMinor: cycle.annualCeilingMinor.toString() },
      ),
    );
  }
}

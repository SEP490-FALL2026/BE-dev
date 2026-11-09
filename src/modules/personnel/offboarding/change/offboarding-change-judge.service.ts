import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../../organization/public/organization-history.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { TransferGuardService } from '../../transfer/transfer-guard.service';
import { previousSuccessorChoice } from '../../transfer/transfer.policy';
import { OffboardingRefusedError } from '../offboarding.errors';
import { changeLastDayRefusal, departureEffectiveOn } from '../offboarding.policy';
import { OffboardingPeriodsService } from '../offboarding-periods.service';
import type { ChangeLastDayInput, OffboardingRecord, SuccessorChoice } from '../offboarding.types';
import { changeFactsOf } from './offboarding-change.policy';

export interface JudgedMove {
  endsOn: BusinessDate;
  leavesAsHead: boolean;
  chosen: SuccessorChoice | undefined;
}

/**
 * Judges the move of the last working day of a handover (`US-03-04` AC-14, AC-22, AC-29) like a record: the new day against the person and
 * the placement, and, once the periods the record wrote are put back, who heads the department on the new day and who follows them. A refusal
 * rolls the whole command back, the putting back included. Throws OffboardingRefusedError.
 */
@Injectable()
export class OffboardingChangeJudge {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly periods: OffboardingPeriodsService,
  ) {}

  async judge(tx: DbTx, held: OffboardingRecord, today: BusinessDate, input: ChangeLastDayInput): Promise<JudgedMove> {
    this.checkCancelledPlacement(held, input.lastWorkingDay);
    const placementFrom = await this.getPlacementFrom(tx, held, today);
    const employee = await this.organizationReads.getEmployee(held.employeeId, tx);
    if (!employee) throw new OffboardingRefusedError('EMPLOYEE_NOT_FOUND');
    const facts = changeFactsOf(held, {
      today,
      hireDate: employee.hireDate,
      placementFrom,
      newLastWorkingDay: input.lastWorkingDay,
      reason: input.reason,
      grounds: input.grounds,
    });
    const early = changeLastDayRefusal({ ...facts, successor: null });
    if (early) throw new OffboardingRefusedError(early.code, early.details);

    if (held.departmentId !== null) {
      // The periods go back first so the new day is judged on the department as it was before the handover; a refusal rolls it all back.
      await this.periods.undo(tx, held);
    }
    const endsOn = departureEffectiveOn({
      lastWorkingDay: input.lastWorkingDay,
      blockNow: false,
      today,
      placementFrom,
    });
    const { leavesAsHead, chosen } = await this.judgeHeadSuccessor(tx, held, endsOn, input.successor);

    return { endsOn, leavesAsHead, chosen };
  }

  private checkCancelledPlacement(held: OffboardingRecord, lastWorkingDay: BusinessDate): void {
    if (held.cancelledPlacementId && held.cancelledPlacementFrom && lastWorkingDay >= held.cancelledPlacementFrom) {
      throw new OffboardingRefusedError('PLACEMENT_OVERLAP', {
        reason: 'FIRST_PLACEMENT_PENDING',
        validFrom: held.cancelledPlacementFrom,
      });
    }
  }

  private async getPlacementFrom(tx: DbTx, held: OffboardingRecord, today: BusinessDate): Promise<BusinessDate | null> {
    if (held.departmentId === null) return null;
    const from = held.placementClosedId ? await this.history.getPlacementStart(tx, held.placementClosedId) : null;

    return from ?? today;
  }

  private async judgeHeadSuccessor(
    tx: DbTx,
    held: OffboardingRecord,
    endsOn: BusinessDate,
    successorInput?: SuccessorChoice,
  ): Promise<{ leavesAsHead: boolean; chosen?: SuccessorChoice }> {
    if (held.departmentId === null) return { leavesAsHead: false };
    const lastInOffice = addDays(endsOn, -1);
    const heads = await this.history.getHeadsOnDates([{ departmentId: held.departmentId, onDate: lastInOffice }], tx);
    const leavesAsHead = heads.get(`${held.departmentId}|${lastInOffice}`) === held.employeeId;
    const chosen = successorInput ?? previousSuccessorChoice(held.headHandover);
    if (leavesAsHead) {
      const refusal = await this.guard.judgeSuccessor(tx, {
        chosen,
        leaverId: held.employeeId,
        departmentId: held.departmentId,
        day: endsOn,
      });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
    }

    return { leavesAsHead, chosen };
  }
}

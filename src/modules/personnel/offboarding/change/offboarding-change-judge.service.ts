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

/** What a move of the last working day was judged on, and so what it is written from. */
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
    const placementFrom =
      (held.placementClosedId ? await this.history.getPlacementStart(tx, held.placementClosedId) : null) ?? today;
    const employee = await this.organizationReads.getEmployee(held.employeeId, tx);
    if (!employee) throw new OffboardingRefusedError('EMPLOYEE_NOT_FOUND');
    const facts = changeFactsOf(held, {
      today,
      hireDate: employee.hireDate,
      placementFrom,
      newLastWorkingDay: input.lastWorkingDay,
      reason: input.reason,
    });
    const early = changeLastDayRefusal({ ...facts, successor: null });
    if (early) throw new OffboardingRefusedError(early.code, early.details);

    // The periods go back first so the new day is judged on the department as it was before the handover; a refusal rolls it all back.
    await this.periods.undo(tx, held);
    const endsOn = departureEffectiveOn({ lastWorkingDay: input.lastWorkingDay, abrupt: false, today, placementFrom });
    const lastInOffice = addDays(endsOn, -1);
    // Read in this transaction, after the periods went back: a read outside it would still see the handover the record wrote.
    const heads = await this.history.getHeadsOnDates([{ departmentId: held.departmentId, onDate: lastInOffice }], tx);
    const leavesAsHead = heads.get(`${held.departmentId}|${lastInOffice}`) === held.employeeId;
    const chosen: SuccessorChoice | undefined = input.successor ?? previousSuccessorChoice(held.headHandover);
    const refusal = leavesAsHead
      ? await this.guard.judgeSuccessor(tx, {
          chosen,
          leaverId: held.employeeId,
          departmentId: held.departmentId,
          day: endsOn,
        })
      : null;
    if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);

    return { endsOn, leavesAsHead, chosen };
  }
}

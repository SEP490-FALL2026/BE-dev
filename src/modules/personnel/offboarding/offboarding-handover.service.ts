import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { PendingBlockOutcome } from '../../identity-access/public/identity-access.types';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { handoverDueOn } from './offboarding.policy';
import type { OffboardingRecord } from './offboarding.types';

/** The most working days a deadline is counted over: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * What the record of a departure keeps of the old handover step after `QĐ-110g` (no confirmation of a handover is asked of anyone any
 * more): the refusal of the person from the day after the last working day, and the day the old column `handover_due_on` of a planned
 * departure still holds (the last working day less one working day, which the constraint of the table asks for until the columns go).
 * The seats and the tasks are never touched here.
 */
@Injectable()
export class OffboardingHandoverService {
  constructor(
    private readonly parameters: OperatingParametersApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** From the day after the last working day the person is refused, whatever the state of the case (QĐ-100q). */
  blockAccessAfterLastDay(tx: DbTx, record: OffboardingRecord): Promise<void> {
    return this.identity.setDepartureBlock(tx, {
      employeeId: record.employeeId,
      cause: 'DEPARTURE_LAST_DAY',
      blockedFrom: addDays(record.lastWorkingDay, 1),
      caseId: record.id,
    });
  }

  /** A departure blocked now: refused from the day it is recorded, however far the last working day is. */
  blockAccessNow(tx: DbTx, record: OffboardingRecord, today: BusinessDate): Promise<void> {
    return this.identity.setDepartureBlock(tx, {
      employeeId: record.employeeId,
      cause: 'DEPARTURE_BLOCK_NOW',
      blockedFrom: today,
      caseId: record.id,
    });
  }

  /** The last working day moved: the block that follows it moves with it. */
  moveAccessBlock(tx: DbTx, employeeId: string, lastWorkingDay: BusinessDate): Promise<void> {
    return this.identity.moveDepartureBlock(tx, employeeId, addDays(lastWorkingDay, 1));
  }

  /** The handover is cancelled: a block not in force is dropped; one in force stays for the Super Admin to lift. */
  releaseAccessBlock(tx: DbTx, employeeId: string, today: BusinessDate): Promise<PendingBlockOutcome> {
    return this.identity.clearPendingDepartureBlock(tx, employeeId, today);
  }

  /** The day the old column holds for a planned departure: the last working day less one working day. */
  async plannedDueOn(lastWorkingDay: BusinessDate): Promise<BusinessDate> {
    const nonWorking = await this.parameters.getNonWorkingDates(
      addDays(lastWorkingDay, -CALENDAR_WINDOW_DAYS),
      lastWorkingDay,
    );

    return handoverDueOn(lastWorkingDay, nonWorking);
  }
}

import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RevocationSource } from '../public/licensing.types';
import { shortDueOn } from './handover-confirmer.policy';

const SHORT_DEADLINE = 'HANDOVER_SHORT_DEADLINE_WORKING_DAYS';
const ABRUPT_HOLD = 'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS';
/** Both parameters are at most thirty working days: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * What the opening of a duty reads of the organization and the calendar: today, the department a person is in, who heads it, and
 * the deadline of a short handover (one parameter for the short cases, one for the hold after an abrupt departure).
 */
@Injectable()
export class HandoverCaseFacts {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  today(now: Date, tx?: DbTx): Promise<BusinessDate> {
    return this.organizationReads.businessToday(now, tx);
  }

  /** The deadline of a handover opened today by this source, counted in working days after today. */
  async dueFor(source: RevocationSource, today: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue(source === 'ABRUPT_DEPARTURE' ? ABRUPT_HOLD : SHORT_DEADLINE));
    const nonWorking = await this.parameters.getNonWorkingDates(today, addDays(today, CALENDAR_WINDOW_DAYS));

    return shortDueOn(today, days, nonWorking);
  }

  /** The department the person is placed in on the day, or null when they are in none. */
  async departmentOf(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<string | null> {
    return (await this.organizationReads.getEmployeePlacement(employeeId, today, tx))?.departmentId ?? null;
  }

  /** Whether the person heads the department on the day. */
  async heads(employeeId: string, departmentId: string, today: BusinessDate, tx?: DbTx): Promise<boolean> {
    const heads = await this.history.getHeadsOnDates([{ departmentId, onDate: today }], tx);

    return heads.get(`${departmentId}|${today}`) === employeeId;
  }
}

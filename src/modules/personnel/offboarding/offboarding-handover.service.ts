import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays } from '../../../core/working-days';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingService } from '../../licensing/licensing.service';
import type { OperatorAuditActor } from '../../licensing/licensing-handover.types';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import type { PersonnelActor } from '../personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { handoverDueOn } from './offboarding.policy';
import type { OffboardingRecord } from './offboarding.types';

const ABRUPT_HOLD = 'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS';
/** The most working days a deadline is counted over: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * What the record of a departure asks of the handover confirmation of `licensing` (`US-03-04` AC-1, AC-7, AC-14, AC-15, AC-18,
 * AC-19): the confirmation of every tool is opened with the deadline of the last working day less one working day, moves with the
 * last day, and is cancelled with the handover. A departure nobody planned opens only the tools that lose data, with the short hold
 * of an abrupt departure. The seats and the tasks are never touched here. When the actor is the controlled procedure (spec L.2) the
 * facade is given the account of the Super Admin only for the columns that demand one, and the ticket as who the Audit Trail names.
 */
@Injectable()
export class OffboardingHandoverService {
  constructor(
    private readonly licensing: LicensingService,
    private readonly parameters: OperatingParametersService,
    private readonly guard: TransferGuardService,
  ) {}

  /** The day a planned handover must be confirmed by: the last working day less one working day. */
  async plannedDueOn(lastWorkingDay: BusinessDate): Promise<BusinessDate> {
    const nonWorking = await this.parameters.getNonWorkingDates(
      addDays(lastWorkingDay, -CALENDAR_WINDOW_DAYS),
      lastWorkingDay,
    );

    return handoverDueOn(lastWorkingDay, nonWorking);
  }

  /** How long the tools that lose data are held for an abrupt departure, counted from `today`. */
  async abruptDueOn(today: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue(ABRUPT_HOLD));
    const nonWorking = await this.parameters.getNonWorkingDates(today, addDays(today, CALENDAR_WINDOW_DAYS));

    return addWorkingDays(today, days, nonWorking);
  }

  async open(
    tx: DbTx,
    actor: PersonnelActor,
    record: OffboardingRecord,
    facts: { leaverIsHead: boolean; today: BusinessDate },
  ): Promise<void> {
    await this.licensing.openHandoverDuties(tx, await this.guard.standIn(tx, actor), {
      leaverEmployeeId: record.employeeId,
      source: record.abrupt ? 'ABRUPT_DEPARTURE' : 'DEPARTURE',
      caseRefId: record.id,
      // The day after it is the day a successor to a head who leaves is looked up for: the day the membership ends.
      lastWorkingDay: addDays(record.departureEffectiveOn, -1),
      dueOn: record.handoverDueOn ?? (await this.abruptDueOn(facts.today)),
      leaverIsHead: facts.leaverIsHead,
      departmentId: record.departmentId,
      operator: this.operatorOf(actor),
    });
  }

  /** The last working day moved: the confirmations that still wait take the new deadline, and look the successor up on the new day. */
  async reconcile(tx: DbTx, actor: PersonnelActor, record: OffboardingRecord): Promise<void> {
    if (record.handoverDueOn === null) return;
    await this.licensing.reconcileHandoverDuties(tx, await this.guard.standIn(tx, actor), {
      caseRefId: record.id,
      dueOn: record.handoverDueOn,
      lastWorkingDay: addDays(record.departureEffectiveOn, -1),
      operator: this.operatorOf(actor),
    });
  }

  async cancel(tx: DbTx, actor: PersonnelActor, record: OffboardingRecord, reason: string): Promise<void> {
    await this.licensing.cancelHandoverDuties(tx, await this.guard.standIn(tx, actor), {
      caseRefId: record.id,
      reason,
      operator: this.operatorOf(actor),
    });
  }

  /** Who the Audit Trail names for the duties: the ticket when the procedure acts, nobody special for a person who signed in. */
  private operatorOf(actor: PersonnelActor): OperatorAuditActor | undefined {
    return actor.kind === 'OPERATOR'
      ? { ticketId: actor.ticketId, ticketRef: actor.ticketRef, context: actor.context }
      : undefined;
  }
}

import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { stateAfterCancelledDeparture } from './leave.policy';
import { LeaveRepo } from './leave.repo';
import type { LeaveRecord } from './leave.types';

/**
 * The two things the leaving of a person asks of a long leave (`US-03-03` AC-6, `US-03-04` AC-26), for the record of a departure
 * (`g6-offboarding-record`) to call inside its own transaction and under its lock of the employee. Neither moves the work state of the
 * person: the departure does that, and `resumeAfterCancelledDeparture` says what it is to be.
 */
@Injectable()
export class LeaveDepartureService {
  constructor(private readonly leaves: LeaveRepo) {}

  /**
   * A handover for leaving begins on `endedOn`: the leave that runs ends there, so the days of handover are not days of leave. Returns the
   * leave that ended; null when the person was not on leave.
   */
  async endForDeparture(
    tx: DbTx,
    actor: PersonnelActor,
    employeeId: string,
    endedOn: BusinessDate,
  ): Promise<LeaveRecord | null> {
    const leave = await this.leaves.lockActiveOf(tx, employeeId);
    if (!leave) return null;
    const day = endedOn < leave.startedOn ? leave.startedOn : endedOn;
    const ended = await this.leaves.end(tx, leave.id, day, 'DEPARTURE_STARTED');
    await this.leaves.insertChange(tx, {
      leaveId: leave.id,
      kind: 'ENDED_FOR_DEPARTURE',
      returnedOn: day,
      recordedByAppUserId: actorColumns(actor).appUserId,
      recordedByTicketId: actorColumns(actor).ticketId,
    });

    return ended;
  }

  /**
   * The handover was cancelled on `today`: a person whose leave was ended for it and who was not yet due back is on leave again in a new
   * leave that keeps the approved day (the history of the old one is left as it was); otherwise they work. Returns the work state the
   * person is to have.
   */
  async resumeAfterCancelledDeparture(
    tx: DbTx,
    actor: PersonnelActor,
    employeeId: string,
    today: BusinessDate,
  ): Promise<'ON_LONG_LEAVE' | 'WORKING'> {
    // Asked twice for the same cancellation: the leave is open already.
    if (await this.leaves.lockActiveOf(tx, employeeId)) return 'ON_LONG_LEAVE';
    const ended = await this.leaves.findEndedForDeparture(tx, employeeId);
    if (!ended || stateAfterCancelledDeparture(ended, today) === 'WORKING') return 'WORKING';
    const resumed = await this.leaves.insert(tx, {
      organizationId: ended.organizationId,
      employeeId,
      startedOn: today,
      approvedReturnOn: ended.approvedReturnOn,
      resumesLeaveId: ended.id,
      grounds: ended.grounds,
      startedByAppUserId: actorColumns(actor).appUserId,
      startedByTicketId: actorColumns(actor).ticketId,
    });
    await this.leaves.insertChange(tx, {
      leaveId: resumed.id,
      kind: 'RESUMED',
      newReturnOn: resumed.approvedReturnOn,
      returnedOn: today,
      recordedByAppUserId: actorColumns(actor).appUserId,
      recordedByTicketId: actorColumns(actor).ticketId,
    });

    return 'ON_LONG_LEAVE';
  }
}

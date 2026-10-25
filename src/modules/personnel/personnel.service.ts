import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../core/business-date';
import { LeaveQueryService } from './leave/leave-query.service';
import type { LeaveInterval } from './personnel.types';

/**
 * What the other modules read of the personnel context (ADR-0017): the facade of the module. Today the days a person was on long
 * leave, for the rules of the recommendations of G7 (no review while on leave, and the days of leave are not days without activity).
 */
@Injectable()
export class PersonnelService {
  constructor(private readonly leaves: LeaveQueryService) {}

  /**
   * The long leaves of the people that touch the days `from` to `to` (both included), one row for each leave, in one statement. A person
   * is on leave from `startedOn` up to, and not including, `endedOn` (the day they came back or the handover began); `endedOn` is null
   * while the leave runs. A rule that needs only the days inside the span cuts the rows to it.
   */
  getLeaveIntervals(employeeIds: readonly string[], from: BusinessDate, to: BusinessDate): Promise<LeaveInterval[]> {
    return this.leaves.intervalsOf(employeeIds, from, to);
  }
}

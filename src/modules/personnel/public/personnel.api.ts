import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { LeaveQueryService } from '../leave/leave-query.service';
import { TransferQueryService } from '../transfer/transfer-query.service';
import type { LeaveInterval, TransferFact } from './personnel.types';

/**
 * What the other modules read of the personnel context (ADR-0017): the facade of the module. Today the days a person was on long
 * leave, for the rules of the recommendations of G7 (no review while on leave, and the days of leave are not days without activity).
 */
@Injectable()
export class PersonnelApi {
  constructor(
    private readonly leaves: LeaveQueryService,
    private readonly transfers: TransferQueryService,
  ) {}

  /**
   * The long leaves of the people that touch the days `from` to `to` (both included), one row for each leave, in one statement. A person
   * is on leave from `startedOn` up to, and not including, `endedOn` (the day they came back or the handover began); `endedOn` is null
   * while the leave runs. A rule that needs only the days inside the span cuts the rows to it.
   */
  getLeaveIntervals(employeeIds: readonly string[], from: BusinessDate, to: BusinessDate): Promise<LeaveInterval[]> {
    return this.leaves.intervalsOf(employeeIds, from, to);
  }

  /**
   * The transfers of these people that have taken effect by `onDate` and are not closed yet, in one statement: `status` is `PENDING` or
   * `EFFECTIVE`, `effectiveOn <= onDate` and the IT Admin has not closed it (a cancelled one is not in overlap). A person in overlap has a
   * recommendation about their seat paused (`QĐ-90c`).
   */
  getTransfersInOverlap(employeeIds: readonly string[], onDate: BusinessDate): Promise<TransferFact[]> {
    return this.transfers.overlapOf(employeeIds, onDate);
  }

  /** The transfers with these ids, whatever their state: a paused recommendation asks whether the transfer that paused it is over. */
  getTransfersByIds(transferIds: readonly string[]): Promise<TransferFact[]> {
    return this.transfers.factsOf(transferIds);
  }
}

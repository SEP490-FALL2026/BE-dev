import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import type { LockedCommitmentOfRequest } from '../budget/commitment.repo';
import type { SeatToCharge } from './seat-month-plan.policy';
import type { PlacementPeriod } from './seat-month.types';

/**
 * What the charge of one subscription reads about its seats (`SM-1`): the seats of the subscription in force on some day of the month, and where the holders
 * were placed over the month. Both are read in the transaction of the charge, after the lock of the month of the subscription, never before it.
 */
@Injectable()
export class SeatMonthSeatsService {
  constructor(
    private readonly licensing: LicensingSeatMonthApi,
    private readonly history: OrganizationHistoryApi,
  ) {}

  /** The seats of the subscription in force on at least one day of the month, read in `tx`. */
  read(tx: DbTx, month: BusinessDate, subscriptionId: string): Promise<SeatOfMonth[]> {
    return this.licensing.getSeatsOfMonth(month, tx, subscriptionId);
  }

  /** The seats with where their holders were placed over the month and the commitment of the request behind each. */
  async toCharge(
    tx: DbTx,
    month: BusinessDate,
    seats: readonly SeatOfMonth[],
    commitmentOf: ReadonlyMap<string, LockedCommitmentOfRequest>,
  ): Promise<SeatToCharge[]> {
    const { start, nextStart } = monthBoundsOf(month);
    const spans = await this.history.getPlacementsBetween(
      [...new Set(seats.map((seat) => seat.employeeId))],
      start,
      nextStart,
      tx,
    );
    const placements = new Map<string, PlacementPeriod[]>();
    for (const span of spans) {
      placements.set(span.employeeId, [
        ...(placements.get(span.employeeId) ?? []),
        { departmentId: span.departmentId, from: span.validFrom, to: span.validTo },
      ]);
    }

    return seats.map((seat) => {
      const commitment = seat.requestId === null ? undefined : commitmentOf.get(seat.requestId);

      return {
        assignmentId: seat.assignmentId,
        employeeId: seat.employeeId,
        fixedDepartmentId: seat.kind === 'SERVICE' ? seat.owningDepartmentId : null,
        held: { from: seat.heldFrom, until: seat.heldUntil },
        placements: placements.get(seat.employeeId) ?? [],
        commitment: commitment ? { id: commitment.id, costCenterId: commitment.costCenterId } : null,
      };
    });
  }
}

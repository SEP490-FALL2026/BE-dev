import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { planSeatMonth, type SeatToCharge } from './seat-month-plan.policy';
import { SeatMonthRepo, type NewSeatMonthCharge, type SeatMonthChargeRecord } from './seat-month.repo';
import type { PlacementPeriod } from './seat-month.types';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);

/**
 * Charges one subscription for one month in the transaction of the caller (`SM-1`, see `SeatMonthService`): reads where the holders were placed, the
 * price and the commitments, lets the plan say what each department bears and what each commitment gives up, and replaces the rows of the month.
 * Locks, in the order of the module: the month of the subscription, the commitments of the requests (by id), the budget years of the Cost Centers
 * (by id). A row that took a commitment down and is no longer asked for stays, because what became an expense never comes back to a commitment.
 */
@Injectable()
export class SeatMonthSubscriptionService {
  constructor(
    private readonly repo: SeatMonthRepo,
    private readonly history: OrganizationHistoryApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly commitments: CommitmentRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Returns the number of rows the month of the subscription has now. */
  async charge(
    tx: DbTx,
    subscriptionId: string,
    month: BusinessDate,
    seats: readonly SeatOfMonth[],
    now: Date,
  ): Promise<number> {
    await this.repo.lockMonthOf(tx, subscriptionId, month);
    const before = await this.repo.ofSubscriptionMonth(tx, subscriptionId, month);
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');
    const year = Number(month.slice(0, 4));
    const commitmentOf = await this.lockCommitments(tx, seats, year);
    const toCharge = await this.seatsToCharge(tx, month, seats, commitmentOf);
    const departmentIds = [...new Set([...toCharge.flatMap((seat) => this.departmentsOf(seat))])];
    const costCenterOfDepartment = await this.organizationReads.getUnitCostCenterIds(departmentIds, tx);
    const [facts] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    const plan = planSeatMonth({
      month,
      subscriptionMonthlyPriceMinor: facts?.monthlyPriceMinor ?? null,
      seats: toCharge,
      costCenterOfDepartment,
      heldByCommitment: new Map(
        [...commitmentOf.values()].map((row) => [
          row.id,
          row.state === 'HELD' ? row.amountMinor - row.releasedMinor - row.appliedMinor : 0n,
        ]),
      ),
      prior: before,
    });
    const daysInMonth = daysBetween(monthBoundsOf(month).start, monthBoundsOf(month).nextStart);
    const written: NewSeatMonthCharge[] = plan.rows.map((row) => ({
      ...row,
      organizationId: organization.id,
      subscriptionId,
      month,
      daysInMonth,
      computedAt: now,
    }));
    await this.replace(tx, year, before, written);
    await this.takeDown(tx, commitmentOf, plan.takenByCommitment);
    if (before.length > 0 || written.length > 0) await this.record(tx, organization.id, subscriptionId, month, written);
    const rows = written.length + before.length - this.removable(before, written).length;
    // The mark is written in the transaction of the rows: it exists if and only if this subscription was charged for the month (`SM1-03`).
    await this.repo.markCharged(tx, { organizationId: organization.id, subscriptionId, month, rows, now });

    return rows;
  }

  private departmentsOf(seat: SeatToCharge): string[] {
    return [
      ...seat.placements.map((period) => period.departmentId),
      ...(seat.fixedDepartmentId ? [seat.fixedDepartmentId] : []),
    ];
  }

  /** The seats with where their holders were placed over the month and the commitment of the request behind each. */
  private async seatsToCharge(
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

  /** The commitment of each request for the year, its row locked, the requests by id. */
  private async lockCommitments(
    tx: DbTx,
    seats: readonly SeatOfMonth[],
    year: number,
  ): Promise<Map<string, LockedCommitmentOfRequest>> {
    const found = new Map<string, LockedCommitmentOfRequest>();
    const requestIds = [...new Set(seats.flatMap((seat) => (seat.requestId === null ? [] : [seat.requestId])))].sort(
      byId,
    );
    for (const requestId of requestIds) {
      const commitment = (await this.commitments.lockOfRequest(tx, requestId)).find((row) => row.year === year);
      if (commitment) found.set(requestId, commitment);
    }

    return found;
  }

  /** The rows of before that are replaced: all but the ones that took a commitment down and are no longer asked for. */
  private removable(
    before: readonly SeatMonthChargeRecord[],
    written: readonly NewSeatMonthCharge[],
  ): SeatMonthChargeRecord[] {
    const asked = new Set(written.map((row) => `${row.assignmentId}|${row.departmentId}`));

    return before.filter((row) => row.appliedMinor === 0n || asked.has(`${row.assignmentId}|${row.departmentId}`));
  }

  private async replace(
    tx: DbTx,
    year: number,
    before: readonly SeatMonthChargeRecord[],
    written: readonly NewSeatMonthCharge[],
  ): Promise<void> {
    const costCenterIds = [...before, ...written].flatMap((row) =>
      row.costCenterId === null ? [] : [row.costCenterId],
    );
    for (const costCenterId of [...new Set(costCenterIds)].sort(byId))
      await this.yearLock.lock(tx, costCenterId, [year]);
    await this.repo.deleteRows(
      tx,
      this.removable(before, written).map((row) => row.id),
    );
    await this.repo.insertMany(tx, written);
  }

  private async takeDown(
    tx: DbTx,
    commitmentOf: ReadonlyMap<string, LockedCommitmentOfRequest>,
    taken: ReadonlyMap<string, bigint>,
  ): Promise<void> {
    for (const commitment of [...commitmentOf.values()].sort((a, b) => byId(a.id, b.id))) {
      const takeMinor = taken.get(commitment.id) ?? 0n;
      if (takeMinor === 0n) continue;
      const left = commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor - takeMinor;
      await this.commitments.applyInvoice(tx, commitment, { takeMinor, stateAfter: left === 0n ? 'EXPENSED' : 'HELD' });
    }
  }

  private async record(
    tx: DbTx,
    organizationId: string,
    subscriptionId: string,
    month: BusinessDate,
    written: readonly NewSeatMonthCharge[],
  ): Promise<void> {
    await this.audit.record(tx, {
      organizationId,
      actorKind: 'SYSTEM',
      action: 'SEAT_MONTH.CHARGED',
      resourceType: 'SUBSCRIPTION',
      resourceId: subscriptionId,
      after: {
        month,
        rows: written.length,
        amountMinor: written.reduce((sum, row) => sum + row.amountMinor, 0n).toString(),
        appliedMinor: written.reduce((sum, row) => sum + row.appliedMinor, 0n).toString(),
      },
      correlationId: `seat-month:${subscriptionId}:${month}`,
    });
  }
}

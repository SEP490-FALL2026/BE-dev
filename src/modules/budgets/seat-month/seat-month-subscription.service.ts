import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { ThresholdAlertService } from '../threshold/threshold-alert.service';
import { planSeatMonth, type ReturnedApplication, type SeatToCharge } from './seat-month-plan.policy';
import { SeatMonthSeatFactsService } from './seat-month-seat-facts.service';
import { SeatMonthRepo, type NewSeatMonthCharge, type SeatMonthChargeRecord } from './seat-month.repo';

/**
 * The Cost Centers whose use the rows of before and the rows written touch, in the year of the month, except the ones this transaction has a commitment locked
 * for that still waits for a budget: the decision of a version takes the budget year of its Cost Center first and then updates the waiting commitments, so a
 * transaction that already holds one must not ask for that year (exception E1 in `docs/rules/database-business.md`). A Cost Center with no budget has no threshold, so no alert is lost.
 */
const costCentersOf = (
  year: number,
  before: readonly SeatMonthChargeRecord[],
  written: readonly NewSeatMonthCharge[],
  waiting: ReadonlySet<string>,
): { costCenterId: string; year: number }[] =>
  [...before, ...written].flatMap((row) =>
    row.costCenterId === null || waiting.has(row.costCenterId) ? [] : [{ costCenterId: row.costCenterId, year }],
  );

/** The Cost Centers of the commitments this transaction locked, by whichever way, that still wait for a budget (attached to no version). */
const waitingCostCenters = (held: ReadonlyMap<string, HeldCommitment>): Set<string> =>
  new Set([...held.values()].filter((row) => row.attachedVersionId === null).map((row) => row.costCenterId));

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);

/** What of a commitment the plan reads and the writes after it need, whichever way the commitment was found. */
interface HeldCommitment {
  id: string;
  state: string;
  amountMinor: bigint;
  releasedMinor: bigint;
  appliedMinor: bigint;
  costCenterId: string;
  /** The version it is attached to; null while it waits for a budget. */
  attachedVersionId: string | null;
}

/**
 * Charges one subscription for one month in the transaction of the caller (`SM-1`, see `SeatMonthService`): reads the seats of the subscription, where the
 * holders were placed, the price and the commitments, lets the plan say what each department bears, what each commitment gives up and what it gets back, and
 * replaces the rows of the month. A month charged again gives the same rows and moves nothing; when a row applies less than before, or is gone, what it applied is
 * written as a reversal and the commitment holds it again, so no seat-month is applied twice and the commitment of another Cost Center is never touched (`SM1-06`).
 * Locks, in the order of the module: the month of the subscription (the seats are read after it, so nobody who held the lock before can change them under this
 * charge), the commitments of the requests (by id), the ones a row of before applied to, the budget years of the Cost Centers (by id). The one exception is
 * the one named E1 in `docs/rules/database-business.md`: a Cost Center whose commitment this transaction locked and that still waits for a budget never has its budget year taken here.
 */
@Injectable()
export class SeatMonthSubscriptionService {
  constructor(
    private readonly repo: SeatMonthRepo,
    private readonly seats: SeatMonthSeatFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly commitments: CommitmentRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
    private readonly thresholds: ThresholdAlertService,
  ) {}

  /**
   * Returns the number of rows the month of the subscription has now, or null when `onlyMissing` is set and the subscription already has its mark once the lock
   * of the month is held (a pass that waited for the lock finds the month charged by the one that held it, and leaves its rows as they are).
   */
  async charge(
    tx: DbTx,
    subscriptionId: string,
    month: BusinessDate,
    now: Date,
    onlyMissing = false,
  ): Promise<number | null> {
    await this.repo.lockMonthOf(tx, subscriptionId, month);
    if (onlyMissing && (await this.repo.isCharged(tx, subscriptionId, month))) return null;
    const seats = await this.seats.read(tx, month, subscriptionId);
    const before = await this.repo.ofSubscriptionMonth(tx, subscriptionId, month);
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The installation has no organization.');
    const year = Number(month.slice(0, 4));
    const commitmentOf = await this.lockCommitments(tx, seats, year);
    const held = await this.lockPriorCommitments(tx, before, commitmentOf);
    const waiting = waitingCostCenters(held);
    const toCharge = await this.seats.toCharge(tx, month, seats, commitmentOf);
    const departmentIds = [...new Set([...toCharge.flatMap((seat) => this.departmentsOf(seat))])];
    const costCenterOfDepartment = await this.organizationReads.getUnitCostCenterIds(departmentIds, tx);
    const [facts] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    const plan = planSeatMonth({
      month,
      subscriptionMonthlyPriceMinor: facts?.monthlyPriceMinor ?? null,
      seats: toCharge,
      costCenterOfDepartment,
      heldByCommitment: new Map(
        [...held.values()].map((row) => [
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
    // What each Cost Center uses is read before the rows are replaced and after the commitments took what they apply, to tell the threshold the month crosses (`RV-2`): the rows replace
    // the ones of before, so the use goes by what changed and never by the whole month again.
    const watch = await this.thresholds.watch(tx, costCentersOf(year, before, written, waiting));
    await this.replace(tx, year, before, written, waiting);
    await this.giveBack(tx, { organizationId: organization.id, subscriptionId, month, now }, plan.returned);
    await this.takeDown(tx, plan.takenByCommitment);
    await this.thresholds.settle(tx, watch, now);
    if (before.length > 0 || written.length > 0)
      await this.record(tx, organization.id, subscriptionId, month, written, plan.returned);
    // The mark is written in the transaction of the rows: it exists if and only if this subscription was charged for the month (`SM1-03`).
    await this.repo.markCharged(tx, {
      organizationId: organization.id,
      subscriptionId,
      month,
      rows: written.length,
      now,
    });

    return written.length;
  }

  private departmentsOf(seat: SeatToCharge): string[] {
    return [
      ...seat.placements.map((period) => period.departmentId),
      ...(seat.fixedDepartmentId ? [seat.fixedDepartmentId] : []),
    ];
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

  /**
   * Every commitment the plan may read or change: the ones of the seats of the month, and the ones a row of before applied to that no seat of the month points
   * at any more (a seat taken back, a request that no longer is behind it), locked by id after the others.
   */
  private async lockPriorCommitments(
    tx: DbTx,
    before: readonly SeatMonthChargeRecord[],
    commitmentOf: ReadonlyMap<string, LockedCommitmentOfRequest>,
  ): Promise<Map<string, HeldCommitment>> {
    const held = new Map<string, HeldCommitment>([...commitmentOf.values()].map((row) => [row.id, row]));
    const extra = [
      ...new Set(
        before.flatMap((row) => (row.commitmentId !== null && row.appliedMinor > 0n ? [row.commitmentId] : [])),
      ),
    ]
      .filter((id) => !held.has(id))
      .sort(byId);
    for (const id of extra) {
      const row = await this.commitments.lockById(tx, id);
      if (row) held.set(id, row);
    }

    return held;
  }

  private async replace(
    tx: DbTx,
    year: number,
    before: readonly SeatMonthChargeRecord[],
    written: readonly NewSeatMonthCharge[],
    waiting: ReadonlySet<string>,
  ): Promise<void> {
    const costCenterIds = [...before, ...written].flatMap((row) =>
      row.costCenterId === null || waiting.has(row.costCenterId) ? [] : [row.costCenterId],
    );
    for (const costCenterId of [...new Set(costCenterIds)].sort(byId))
      await this.yearLock.lock(tx, costCenterId, [year]);
    await this.repo.deleteRows(
      tx,
      before.map((row) => row.id),
    );
    await this.repo.insertMany(tx, written);
  }

  /** What the rows applied before and apply no more goes back to its commitments: the reversals first, then each commitment holds it again. */
  private async giveBack(
    tx: DbTx,
    month: { organizationId: string; subscriptionId: string; month: BusinessDate; now: Date },
    returned: readonly ReturnedApplication[],
  ): Promise<void> {
    if (returned.length === 0) return;
    await this.repo.insertReversals(
      tx,
      returned.map((row) => ({
        organizationId: month.organizationId,
        commitmentId: row.commitmentId,
        subscriptionId: month.subscriptionId,
        assignmentId: row.assignmentId,
        departmentId: row.departmentId,
        month: month.month,
        amountMinor: row.amountMinor,
        reason: row.reason,
        createdAt: month.now,
      })),
    );
    const total = new Map<string, bigint>();
    for (const row of returned) total.set(row.commitmentId, (total.get(row.commitmentId) ?? 0n) + row.amountMinor);
    for (const [commitmentId, returnMinor] of [...total].sort(([a], [b]) => byId(a, b))) {
      const row = await this.commitments.lockById(tx, commitmentId);
      if (!row) throw new Error(`The commitment ${commitmentId} a seat-month gave back to is gone.`);
      await this.commitments.giveBackApplied(tx, row, returnMinor);
    }
  }

  /** What the rows apply more than before takes each commitment down, read again after what went back to it. */
  private async takeDown(tx: DbTx, taken: ReadonlyMap<string, bigint>): Promise<void> {
    for (const [commitmentId, takeMinor] of [...taken].sort(([a], [b]) => byId(a, b))) {
      if (takeMinor === 0n) continue;
      const row = await this.commitments.lockById(tx, commitmentId);
      if (!row) throw new Error(`The commitment ${commitmentId} a seat-month applies to is gone.`);
      const left = row.amountMinor - row.releasedMinor - row.appliedMinor - takeMinor;
      await this.commitments.applyInvoice(tx, row, { takeMinor, stateAfter: left === 0n ? 'EXPENSED' : 'HELD' });
    }
  }

  private async record(
    tx: DbTx,
    organizationId: string,
    subscriptionId: string,
    month: BusinessDate,
    written: readonly NewSeatMonthCharge[],
    returned: readonly ReturnedApplication[],
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
        returnedMinor: returned.reduce((sum, row) => sum + row.amountMinor, 0n).toString(),
        reversals: returned.length,
      },
      correlationId: `seat-month:${subscriptionId}:${month}`,
    });
  }
}

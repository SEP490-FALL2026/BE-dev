import { Injectable } from '@nestjs/common';
import { normalizeAccountIdentifier } from '../public/account-identifier.policy';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { endAfterGrant } from '../../../core/term-limit';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { SeatTarget, SeatTargetRef } from '../../catalog/public/catalog.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  AssignmentConflictError,
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  ProvisioningSubscriptionError,
  SeatTargetNotFoundError,
} from '../public/licensing.errors';
import type {
  AssignmentHolder,
  AssignmentRecord,
  ExistingAssignment,
  NewBaselineAssignment,
  SeatHolder,
  SeatUsage,
  WaitingRegrant,
} from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { toAssignmentFailure } from './assignment-conflicts.repo';
import { AssignmentDepartmentRepo } from './assignment-department.repo';
import {
  assignmentCreatedSnapshot,
  carriedPast,
  nextPeriodStart,
  replacedByGrant,
  seatsToCarry,
} from './assignment.policy';
import { assertBaselineTarget, assertSeatTargetUsable, toSeatTargetRef } from './baseline-target.policy';
import { AssignmentRepo } from './assignment.repo';
import { AssignmentCarryRepo } from './assignment-carry.repo';

/** What ending an open assignment without a seat needs: the assignment, the request that led to it and the day. */
interface EndWithoutSeatInput {
  organizationId: string;
  assignmentId: string;
  requestId: string;
  now: Date;
}

/** What the seat a request is granted is made of (`createFromRequest`). */
interface GrantedSeat {
  organizationId: string;
  requestId: string;
  /** The department of the request: the department of the person the seat is for. */
  departmentId: string;
  target: SeatTarget;
  holder: AssignmentHolder;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
  /** The right of the person that this grant ended the same day (`endReplacedByGrant`, R-49); kept on the new right. */
  replacesAssignmentId?: string | null;
}

/**
 * The assignments of seats (`US-02-05`, `US-07-01` AC-14). Assignments reach this service by the baseline import and by
 * a request; both are written under the lock of the subscription, with an audit event for each, and the database holds the
 * invariants whoever writes. There is no service account any more (`QĐ-110m`). The
 * account identifier never enters an audit event.
 */
@Injectable()
export class AssignmentService {
  /** How many seats each of these subscriptions holds as of `day`: the count of the seats of the warehouse (INV-01), in one statement. */
  countHoldingOfSubscriptions(ids: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.repo.countHoldingOfSubscriptions(ids, day, tx);
  }

  /** The seats of these subscriptions held as of `day`, by holder (the person, or who answers for a service account), in one statement. */
  countHoldingByHolder(
    ids: readonly string[],
    day: BusinessDate,
    tx?: DbTx,
  ): Promise<{ subscriptionId: string; employeeId: string; seats: number }[]> {
    return this.repo.countHoldingByHolder(ids, day, tx);
  }

  constructor(
    private readonly repo: AssignmentRepo,
    private readonly byDepartment: AssignmentDepartmentRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly periods: SubscriptionPeriodApi,
    private readonly carrying: AssignmentCarryRepo,
  ) {}

  /** The target a baseline is for: exactly one subscription or one internal plan. Throws SeatTargetInvalidError. */
  targetRef(input: { subscriptionId?: string; planId?: string }): SeatTargetRef {
    return toSeatTargetRef(input);
  }

  /**
   * The target of a baseline (one subscription or one internal plan) read without a lock, for a preview. Throws
   * SeatTargetNotFoundError, SeatPlanNotSupportedError, SeatTargetInvalidError and SeatQuantityUnknownError.
   */
  async resolveBaselineTarget(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget> {
    const target = await this.catalog.findSeatTarget(ref, tx);
    assertBaselineTarget(ref, target);

    return target;
  }

  /** The same, locked until the transaction ends: the subscription `FOR UPDATE`, an internal plan `FOR SHARE`. */
  async lockBaselineTarget(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget> {
    const target = await this.catalog.lockSeatTarget(tx, ref);
    assertBaselineTarget(ref, target);

    return target;
  }

  /** A draft subscription and a retired application take no seat, from a request any more than from a baseline. */
  assertSeatTargetUsable(target: SeatTarget): void {
    assertSeatTargetUsable(target);
  }

  /** Who holds a seat today in the organization calendar, and how many. */
  async openHolders(): Promise<SeatHolder[]> {
    return this.repo.openHolders(await this.organizationReads.businessToday());
  }

  /** One page of the personal seats a person holds today in these plans, and the total. */
  async pageHeldOfPlans(
    employeeId: string,
    planIds: readonly string[],
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: AssignmentRecord[]; total: number }> {
    return this.repo.pageHeldOfPlans(
      employeeId,
      planIds,
      await this.organizationReads.businessToday(new Date(), tx),
      page.skip,
      page.take,
      tx,
    );
  }

  countBaseline(): Promise<number> {
    return this.repo.countBaseline();
  }

  existingOf(target: SeatTarget, tx?: DbTx): Promise<ExistingAssignment[]> {
    return this.repo.existingOf({ subscriptionId: target.subscriptionId, planId: target.planId }, tx);
  }

  /**
   * Writes the rows of a baseline import, in order, in the caller transaction, each with its audit event. Throws
   * AssignmentConflictError (with the index of the row) when the database refuses one that the judgement accepted, which
   * means the data changed since, and SeatBaselineClosedError when the baseline closed in the meantime.
   */
  async createBaseline(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { organizationId: string; importId: string; target: SeatTarget; rows: readonly NewBaselineAssignment[] },
  ): Promise<AssignmentRecord[]> {
    const created: AssignmentRecord[] = [];
    for (const [index, row] of input.rows.entries()) {
      // Gói 9: bỏ guard phòng — cấp từ kho được phép cấp qua phòng (không kiểm owner_department_id).
      let record: AssignmentRecord;
      try {
        record = await this.repo.insert(tx, {
          organizationId: input.organizationId,
          source: 'BASELINE',
          kind: row.kind,
          planId: input.target.planId,
          subscriptionId: input.target.subscriptionId,
          employeeId: row.employeeId,
          accountIdentifier: row.accountIdentifier.trim(),
          normalizedAccountIdentifier: normalizeAccountIdentifier(row.accountIdentifier),
          reason: row.reason,
          costCenterId: row.costCenterId,
          owningDepartmentId: row.owningDepartmentId,
          effectiveFrom: row.effectiveFrom,
          effectiveFromBasis: row.effectiveFromBasis,
          expectedEndDate: row.expectedEndDate,
          predecessorId: null,
          baselineImportId: input.importId,
          isMachineAccount: false,
          machineAccountNote: null,
          createdByAppUserId: actor.appUserId,
        });
      } catch (error) {
        throw toAssignmentFailure(error, index) ?? error;
      }
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          input.organizationId,
          'LICENSE_ASSIGNMENT.CREATED',
          'LicenseAssignment',
          record.id,
          null,
          assignmentCreatedSnapshot(record, input.importId),
        ),
      );
      created.push(record);
    }

    return created;
  }

  /**
   * Writes the seat a request is granted, in the caller transaction (which holds the lock of the seat target), with its
   * audit event: a personal seat, or a service account with its reason, owning department and Cost Center (`US-05-21`). The seats
   * of a subscription are one pool for every department (`QĐ-103d`): the seat is held by the department of the request
   * (`departmentId`), the department of the person it is for; `replacesAssignmentId` is the right this grant ended the same day (`endReplacedByGrant`, R-49).
   * When a next period, recorded ahead of its start, continues the subscription, the seat goes on into it in the same transaction (`carryToNextPeriod`).
   * Throws AssignmentConflictError when the database refuses the seat:
   * an overlap, the seats all taken, the identifier in use, no expected end date for time-limited staff, or a rule of the baseline;
   * ProvisioningSubscriptionError (`NEXT_PERIOD_SEATS`) when the next period buys no seat for it.
   */
  async createFromRequest(tx: DbTx, actor: AuthenticatedPrincipal, input: GrantedSeat): Promise<AssignmentRecord> {
    const { holder } = input;
    // The pool of seats is shared (`QĐ-103d`): a personal seat carries the department of the person it is for, a service account its owner's.
    const owningDepartmentId = holder.kind === 'SERVICE' ? holder.owningDepartmentId : input.departmentId;
    let record: AssignmentRecord;
    try {
      record = await this.repo.insert(tx, {
        organizationId: input.organizationId,
        source: 'REQUEST',
        kind: holder.kind,
        planId: input.target.planId,
        subscriptionId: input.target.subscriptionId,
        employeeId: holder.employeeId,
        accountIdentifier: holder.accountIdentifier,
        normalizedAccountIdentifier: normalizeAccountIdentifier(holder.accountIdentifier),
        reason: holder.reason,
        costCenterId: holder.costCenterId,
        owningDepartmentId,
        effectiveFrom: input.effectiveFrom,
        effectiveFromBasis: 'ACTUAL',
        expectedEndDate: input.expectedEndDate,
        predecessorId: null,
        baselineImportId: null,
        replacesAssignmentId: input.replacesAssignmentId ?? null,
        // A new grant is a plain seat: the flag is put on it afterwards, by the IT Admin (`QĐ-110m`).
        isMachineAccount: false,
        machineAccountNote: null,
        createdByAppUserId: actor.appUserId,
      });
    } catch (error) {
      throw toAssignmentFailure(error, 0) ?? error;
    }
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_ASSIGNMENT.CREATED',
        'LicenseAssignment',
        record.id,
        null,
        // Neither the identifier of the account nor its purpose is written to the trail.
        {
          ...assignmentCreatedSnapshot(record, null),
          owningDepartmentId: record.owningDepartmentId,
          requestId: input.requestId,
        },
      ),
    );
    await this.carryToNextPeriod(tx, actor, { seat: record, today: input.effectiveFrom, requestId: input.requestId });

    return record;
  }

  /**
   * Ends the right a grant replaces, the day it is given, before the new right is written (R-49, `QĐ-110q`, SPEC MF3-C.4): a person in the grace of a
   * transfer asked again, on the same subscription, for software they hold, and the database would refuse two personal rights of one person at once
   * (`INV-02`). The old right ends that day (`valid_until`), so the new one begins as it ends and the seat is counted once; nothing is done at the
   * vendor and no task of revocation is made (it is the same account: the grant of the new right carries on from it), and the grace no longer takes it back.
   * Done in the transaction of the grant, which holds the lock of the seat target. Returns the id of the right it ended, or null when the right is not
   * one it ends (`replacedByGrant`: another person, another subscription, not open, a revocation under way).
   */
  async endReplacedByGrant(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      employeeId: string;
      replacesAssignmentId: string;
      target: SeatTarget;
      today: BusinessDate;
      /** A task of revocation is working the old right already: it ends the right itself. */
      revocationUnderWay: boolean;
    },
  ): Promise<string | null> {
    const old = await this.repo.lock(tx, input.replacesAssignmentId);
    if (
      !old ||
      !replacedByGrant(old, {
        employeeId: input.employeeId,
        target: input.target,
        today: input.today,
        revocationUnderWay: input.revocationUnderWay,
      })
    )
      return null;
    await this.repo.end(tx, old.id, input.today);
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_ASSIGNMENT.ENDED',
        'LicenseAssignment',
        old.id,
        { validUntil: null },
        { validUntil: input.today, regrantRequestId: input.requestId },
      ),
    );

    return old.id;
  }

  /** Whether the old right is one a grant on this target would end if no revocation task stood in the way. */
  async canEndReplacedByGrant(
    tx: DbTx,
    input: { employeeId: string; replacesAssignmentId: string; target: SeatTarget; today: BusinessDate },
  ): Promise<boolean> {
    const old = await this.repo.lock(tx, input.replacesAssignmentId);

    return old !== null && replacedByGrant(old, { ...input, revocationUnderWay: false });
  }

  /** Which of these rights a later right replaced (R-49): the ones a grant ended the day it gave the person the same software again. */
  regrantedAmong(ids: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.repo.replacedAmong(ids, tx);
  }

  /** The grants of a right asked for again (R-49) of this person that wait, with the day each replaced right began: if one fails that right is open again. */
  async waitingRegrantsOf(employeeId: string, tx?: DbTx): Promise<WaitingRegrant[]> {
    const rows = await this.repo.waitingReplacementsOf(employeeId, tx);

    return rows.map((row) => ({
      replacedAssignmentId: row.replacedAssignmentId,
      replacedEffectiveFrom: fromDateColumn(row.replacedValidFrom),
    }));
  }

  /**
   * Closes the assignment of a grant that failed for good: it becomes a failed assignment, the seat is free again on every day,
   * and the row stays as what was decided. Done in the caller transaction, under the lock of the subscription. Throws
   * AssignmentNotFoundError and AssignmentNotOpenError.
   */
  closeFailed(tx: DbTx, actor: AuthenticatedPrincipal, input: EndWithoutSeatInput): Promise<void> {
    return this.endWithoutSeat(tx, actor, input, 'FAILED');
  }

  /** The same for the grant of a request that was withdrawn (`US-05-08`): a cancelled assignment holds no seat either. */
  cancel(tx: DbTx, actor: AuthenticatedPrincipal, input: EndWithoutSeatInput): Promise<void> {
    return this.endWithoutSeat(tx, actor, input, 'CANCELLED');
  }

  private async endWithoutSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: EndWithoutSeatInput,
    how: 'FAILED' | 'CANCELLED',
  ): Promise<void> {
    const probe = await this.repo.find(input.assignmentId, tx);
    if (!probe) throw new AssignmentNotFoundError();
    if (probe.subscriptionId) await this.catalog.lockSeatTarget(tx, { subscriptionId: probe.subscriptionId });
    const current = await this.openToVoid(tx, input.assignmentId, how, input.now);
    const failed = how === 'FAILED';
    await (failed
      ? this.repo.markFailed(tx, current.id, input.now)
      : this.repo.markCancelled(tx, current.id, input.now));
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        failed ? 'LICENSE_ASSIGNMENT.FAILED' : 'LICENSE_ASSIGNMENT.CANCELLED',
        'LicenseAssignment',
        current.id,
        { validUntil: null },
        { [failed ? 'failedAt' : 'cancelledAt']: input.now.toISOString(), requestId: input.requestId },
      ),
    );
    await this.giveBackReplaced(tx, actor, current.id, input, failed ? 'GRANT_FAILED' : 'GRANT_CANCELLED');
  }

  /** Carries these seats of a subscription to its next period from the first day of it, and ends them that day (the renewal recorded); returns how many. */
  carry(
    tx: DbTx,
    input: {
      assignmentIds: readonly string[];
      nextSubscriptionId: string;
      startDate: BusinessDate;
      actorAppUserId: string;
    },
  ): Promise<number> {
    return this.carrying.carry(tx, input);
  }

  /**
   * A seat granted on a subscription that a next period, recorded ahead of its start, continues goes on into that period at once, in the
   * transaction of the grant (`QĐ-35c`): otherwise the seats the next period buys, sized to the rights held and the requests waiting to be
   * granted (`QĐ-103e`), would show it free on its first day with the person holding it (a second grant of it). The same carrying and the
   * same rule as when the renewal was recorded; a seat that ends before the next period begins stays where it is, and in the shared pool so does one that ends on its first day (R2-2). When
   * the next period is the shared pool and holds no free seat for it, one seat is bought on it for the request and the carrying is tried again
   * (S20-T4c, R2-8: the adjustment bought exactly the seats needed, a request granted after it comes in after). Throws ProvisioningSubscriptionError
   * (`NEXT_PERIOD_SEATS`) when the next period is one a department owns and buys no seat for it, nothing written.
   */
  private async carryToNextPeriod(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { seat: AssignmentRecord; today: BusinessDate; requestId: string },
  ): Promise<void> {
    const { seat } = input;
    if (seat.subscriptionId === null) return;
    const [period] = await this.periods.getPeriods([seat.subscriptionId], tx);
    if (!period?.renewedById) return;
    const [next] = await this.periods.getPeriods([period.renewedById], tx);
    const startDate = nextPeriodStart(next, input.today);
    const carried = seatsToCarry(
      [{ validFrom: seat.effectiveFrom, validUntil: seat.validUntil, expectedEndDate: seat.expectedEndDate }],
      startDate ?? seat.effectiveFrom,
    );
    if (startDate === null || next === undefined || carried.length === 0) return;
    // The pool buys exactly the seats the adjustment counted, and the count leaves out a seat that ends on the renewal day of the period that
    // runs (R2-2, A1C-06, V-6): not the first day of the next, which a plan by the year may begin the day after it.
    const renewalOn = period.adjustment?.end ?? startDate;
    if (carriedPast(carried, renewalOn).length === 0) return;

    const carrying = {
      assignmentIds: [seat.id],
      nextSubscriptionId: next.subscriptionId,
      startDate,
      actorAppUserId: actor.appUserId,
    };
    await this.carryOrBuy(tx, actor, { carrying, next, requestId: input.requestId });
  }

  /**
   * Carries the seat; when the next period holds no free seat for it and is the shared pool (no department owns it), buys one seat on it for the
   * request and carries again: the person who comes in after the adjustment was recorded is a seat the IT Admin buys for the period (`QĐ-103q`),
   * told like any seat a grant buys (`QĐ-110v`). Throws ProvisioningSubscriptionError
   * (`NEXT_PERIOD_SEATS`).
   */
  private async carryOrBuy(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      carrying: Parameters<AssignmentCarryRepo['carry']>[1];
      next: { subscriptionId: string };
      requestId: string;
    },
  ): Promise<void> {
    const refused = await this.carrying.carryBehindSavepoint(tx, input.carrying);
    if (refused === null) return;
    this.requireNoRoom(refused);
    const { subscriptionId } = input.next;
    await this.catalog.lockSeatTarget(tx, { subscriptionId });
    await this.catalog.addPoolSeat(tx, actor, subscriptionId, input.requestId);
    try {
      await this.carrying.carry(tx, input.carrying);
    } catch (error) {
      this.requireNoRoom(error as Error);
      throw new ProvisioningSubscriptionError('NEXT_PERIOD_SEATS');
    }
  }

  /** Returns when the database refused the carrying for want of a free seat on the next period; throws any other refusal as the failure it is. */
  private requireNoRoom(error: Error): void {
    const failure = toAssignmentFailure(error, 0);
    if (failure instanceof AssignmentConflictError && failure.conflict === 'SEAT_CAPACITY') return;
    throw failure ?? error;
  }

  /**
   * The assignment locked and open, ready to be voided. A grant carried into a next period at its grant (`carryToNextPeriod`) ended there: the right it made on
   * that period goes first and this one is open again. Throws AssignmentNotFoundError and AssignmentNotOpenError.
   */
  private async openToVoid(
    tx: DbTx,
    assignmentId: string,
    how: 'FAILED' | 'CANCELLED',
    now: Date,
  ): Promise<AssignmentRecord> {
    const locked = await this.repo.lock(tx, assignmentId);
    if (!locked) throw new AssignmentNotFoundError();
    const carriedBack = await this.carrying.takeBack(tx, locked.id, how, now);
    const current = carriedBack ? ((await this.repo.find(locked.id, tx)) ?? locked) : locked;
    if (current.validUntil !== null || current.failedAt !== null || current.cancelledAt !== null) {
      throw new AssignmentNotOpenError();
    }

    return current;
  }

  /**
   * A grant that ended a right of the person (R-49) did not come to be: the right is open again, so the person is not left with neither (the grace takes it
   * back with the rest). Same transaction, under the lock of the seat target the grant held.
   */
  private async giveBackReplaced(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    input: EndWithoutSeatInput,
    cause: 'GRANT_FAILED' | 'GRANT_CANCELLED',
  ): Promise<void> {
    const reopened = await this.repo.reopenReplacedBy(tx, assignmentId);
    if (reopened === null) return;
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_ASSIGNMENT.END_REVERSED',
        'LicenseAssignment',
        reopened,
        { validUntil: input.now.toISOString().slice(0, 10) },
        { validUntil: null, requestId: input.requestId, cause },
      ),
    );
  }

  /**
   * The task of the grant is completed on `grantedOn`: that is the day the right begins, and the end it asked for is cut to a year from
   * it at the latest (`BR-MF1-06a`, `QĐ-106b`). A seat with no end asked for keeps none. `valid_from` is not touched (the database keeps it).
   * Returns the day the seat began and the end it has from then on, null when it has none.
   */
  async recordGranted(
    tx: DbTx,
    assignmentId: string,
    grantedOn: BusinessDate,
  ): Promise<{ effectiveFrom: BusinessDate; expectedEndDate: BusinessDate | null }> {
    const current = await this.repo.find(assignmentId, tx);
    if (!current) throw new AssignmentNotFoundError();
    const expectedEndDate = endAfterGrant({ expectedEndDate: current.expectedEndDate, grantedOn });
    await this.repo.markGranted(tx, assignmentId, { grantedOn, expectedEndDate });

    return { effectiveFrom: current.effectiveFrom, expectedEndDate };
  }

  /** The seats bought, taken and free on today in the organization calendar. Throws SeatTargetNotFoundError. */
  async seatUsage(subscriptionId: string): Promise<SeatUsage> {
    const target = await this.catalog.findSeatTarget({ subscriptionId });
    if (!target) throw new SeatTargetNotFoundError('SUBSCRIPTION');
    const asOf = await this.organizationReads.businessToday();
    const occupied = await this.repo.countOccupying(subscriptionId, asOf);
    const purchased = target.purchasedQuantity;

    return {
      subscriptionId,
      purchased,
      occupied,
      free: purchased === null ? null : Math.max(0, purchased - occupied),
      asOf,
    };
  }
}

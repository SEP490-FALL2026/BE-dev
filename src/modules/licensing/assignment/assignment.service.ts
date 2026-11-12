import { Injectable } from '@nestjs/common';
import { normalizeAccountIdentifier } from '../public/account-identifier.policy';
import type { BusinessDate } from '../../../core/business-date';
import { endAfterGrant } from '../../../core/term-limit';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { SeatTarget, SeatTargetRef } from '../../catalog/public/catalog.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentNotFoundError, AssignmentNotOpenError, SeatTargetNotFoundError } from '../public/licensing.errors';
import type {
  AssignmentHolder,
  AssignmentRecord,
  ExistingAssignment,
  NewBaselineAssignment,
  SeatHolder,
  SeatUsage,
} from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { toAssignmentFailure } from './assignment-conflicts.repo';
import { AssignmentDepartmentRepo } from './assignment-department.repo';
import { assignmentCreatedSnapshot } from './assignment.policy';
import { assertBaselineTarget, assertSeatTargetUsable, toSeatTargetRef } from './baseline-target.policy';
import { AssignmentRepo } from './assignment.repo';

/** What ending an open assignment without a seat needs: the assignment, the request that led to it and the day. */
interface EndWithoutSeatInput {
  organizationId: string;
  assignmentId: string;
  requestId: string;
  now: Date;
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
  ): Promise<{ items: AssignmentRecord[]; total: number }> {
    return this.repo.pageHeldOfPlans(
      employeeId,
      planIds,
      await this.organizationReads.businessToday(),
      page.skip,
      page.take,
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
   * (`departmentId`), the department of the person it is for. Throws AssignmentConflictError when the database refuses the seat:
   * an overlap, the seats all taken, the identifier in use, no expected end date for time-limited staff, or a rule of the baseline.
   */
  async createFromRequest(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      /** The department of the request: the department of the person the seat is for. */
      departmentId: string;
      target: SeatTarget;
      holder: AssignmentHolder;
      effectiveFrom: BusinessDate;
      expectedEndDate: BusinessDate | null;
    },
  ): Promise<AssignmentRecord> {
    const { holder } = input;
    // The pool of seats is shared by every department (`QĐ-103d`): a personal seat carries the department of the person it is for on the
    // day of the grant, whoever owns the subscription; a service account carries the department that owns the account.
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

    return record;
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
    const current = await this.repo.lock(tx, input.assignmentId);
    if (!current) throw new AssignmentNotFoundError();
    if (current.validUntil !== null || current.failedAt !== null || current.cancelledAt !== null) {
      throw new AssignmentNotOpenError();
    }

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
  }

  /**
   * The task of the grant is completed on `grantedOn`: that is the day the right begins, and the end it asked for is cut to a year from
   * it at the latest (`BR-MF1-06a`, `QĐ-106b`). A seat with no end asked for keeps none. `valid_from` is not touched (the database keeps it).
   */
  async recordGranted(tx: DbTx, assignmentId: string, grantedOn: BusinessDate): Promise<void> {
    const current = await this.repo.find(assignmentId, tx);
    if (!current) throw new AssignmentNotFoundError();

    await this.repo.markGranted(tx, assignmentId, {
      grantedOn,
      expectedEndDate: endAfterGrant({ expectedEndDate: current.expectedEndDate, grantedOn }),
    });
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

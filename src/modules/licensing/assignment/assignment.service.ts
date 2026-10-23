import { Injectable } from '@nestjs/common';
import { normalizeAccountIdentifier } from '../../../core/account-identifier';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import type { SeatTarget, SeatTargetRef } from '../../catalog/catalog.types';
import { CatalogService } from '../../catalog/catalog.service';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import { AssignmentNotFoundError, AssignmentNotOpenError, SeatTargetNotFoundError } from '../licensing.errors';
import type {
  AssignmentRecord,
  AssignmentView,
  ExistingAssignment,
  NewBaselineAssignment,
  SeatHolder,
  SeatUsage,
} from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { toAssignmentFailure } from './assignment-conflicts';
import { assertResponsibleChange, toAssignmentView } from './assignment.policy';
import { assertBaselineTarget, assertSeatTargetUsable, toSeatTargetRef } from './baseline-target.policy';
import { AssignmentRepo, type NewAssignment } from './assignment.repo';

const recorded = (record: AssignmentRecord, importId: string | null) => ({
  source: record.source,
  kind: record.kind,
  planId: record.planId,
  subscriptionId: record.subscriptionId,
  employeeId: record.employeeId,
  effectiveFrom: record.effectiveFrom,
  effectiveFromBasis: record.effectiveFromBasis,
  importId,
});

/**
 * The assignments of seats (`US-02-05`, `US-07-01` AC-14). Assignments reach this service by the baseline import and by
 * a change of the person responsible for a service account; both are written under the lock of the subscription, with an
 * audit event for each, and the database holds the invariants whoever writes. The account identifier never enters an
 * audit event.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
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
    return this.repo.openHolders(await this.organization.businessToday());
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
          recorded(record, input.importId),
        ),
      );
      created.push(record);
    }

    return created;
  }

  /**
   * Writes the seat a request is granted, in the caller transaction, which holds the lock of the seat target, with its
   * audit event. Throws AssignmentConflictError when the database refuses it: the person already holds a seat there, the
   * seats are all taken, time-limited staff has no expected end date, or the baseline rule the database keeps.
   */
  async createFromRequest(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      target: SeatTarget;
      employeeId: string;
      accountIdentifier: string;
      effectiveFrom: BusinessDate;
      expectedEndDate: BusinessDate | null;
    },
  ): Promise<AssignmentRecord> {
    let record: AssignmentRecord;
    try {
      record = await this.repo.insert(tx, {
        organizationId: input.organizationId,
        source: 'REQUEST',
        kind: 'PERSONAL',
        planId: input.target.planId,
        subscriptionId: input.target.subscriptionId,
        employeeId: input.employeeId,
        accountIdentifier: input.accountIdentifier,
        normalizedAccountIdentifier: normalizeAccountIdentifier(input.accountIdentifier),
        reason: null,
        costCenterId: null,
        owningDepartmentId: null,
        effectiveFrom: input.effectiveFrom,
        effectiveFromBasis: 'ACTUAL',
        expectedEndDate: input.expectedEndDate,
        predecessorId: null,
        baselineImportId: null,
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
        {
          ...recorded(record, null),
          requestId: input.requestId,
        },
      ),
    );

    return record;
  }

  /**
   * Closes the assignment of a grant that failed for good: it becomes a failed assignment, the seat is free again on every
   * day, and the row stays as what was decided. Done in the caller transaction, under the lock of the subscription as every
   * writer of its seats does. Throws AssignmentNotFoundError and AssignmentNotOpenError.
   */
  async closeFailed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { organizationId: string; assignmentId: string; requestId: string; now: Date },
  ): Promise<void> {
    const probe = await this.repo.find(input.assignmentId, tx);
    if (!probe) throw new AssignmentNotFoundError();
    if (probe.subscriptionId) await this.catalog.lockSeatTarget(tx, { subscriptionId: probe.subscriptionId });
    const current = await this.repo.lock(tx, input.assignmentId);
    if (!current) throw new AssignmentNotFoundError();
    if (current.validUntil !== null || current.failedAt !== null) throw new AssignmentNotOpenError();

    await this.repo.markFailed(tx, current.id, input.now);
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_ASSIGNMENT.FAILED',
        'LicenseAssignment',
        current.id,
        { validUntil: null },
        { failedAt: input.now.toISOString(), requestId: input.requestId },
      ),
    );
  }

  /** The seats bought, taken and free on today in the organization calendar. Throws SeatTargetNotFoundError. */
  async seatUsage(subscriptionId: string): Promise<SeatUsage> {
    const target = await this.catalog.findSeatTarget({ subscriptionId });
    if (!target) throw new SeatTargetNotFoundError('SUBSCRIPTION');
    const asOf = await this.organization.businessToday();
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

  /**
   * Passes an open service account to another person from `effectiveFrom` (`AC-10`, `QĐ-43a`): the old assignment ends
   * that day (it no longer counts), the new one begins that day with the same kind, Cost Center, reason and identifier,
   * chained to the old one, in one transaction under the lock of the subscription, so the seats taken do not change on any
   * day. It grants no new seat, so it is allowed after the baseline is closed. Throws the errors of the policy,
   * AssignmentNotFoundError and AssignmentConflictError.
   */
  async changeResponsible(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate; expectedEndDate: BusinessDate | null },
  ): Promise<{ ended: AssignmentView; created: AssignmentView }> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A service account changed hands before installation');
    const today = await this.organization.businessToday();

    return this.runner.run(async (tx) => {
      const probe = await this.repo.find(assignmentId, tx);
      if (!probe) throw new AssignmentNotFoundError();
      // The subscription first, as every writer of its seats does, then the assignment: one order, no deadlock.
      if (probe.subscriptionId) await this.catalog.lockSeatTarget(tx, { subscriptionId: probe.subscriptionId });
      const current = await this.repo.lock(tx, assignmentId);
      if (!current) throw new AssignmentNotFoundError();

      const holder = await this.lockHolder(tx, input.employeeId, input.effectiveFrom);
      assertResponsibleChange(current, input, holder, today);

      await this.repo.end(tx, current.id, input.effectiveFrom);
      const base: NewAssignment = {
        organizationId: organization.id,
        source: 'HANDOVER',
        kind: current.kind,
        planId: current.planId,
        subscriptionId: current.subscriptionId,
        employeeId: input.employeeId,
        accountIdentifier: current.accountIdentifier,
        normalizedAccountIdentifier: normalizeAccountIdentifier(current.accountIdentifier),
        reason: current.reason,
        costCenterId: current.costCenterId,
        owningDepartmentId: current.owningDepartmentId,
        effectiveFrom: input.effectiveFrom,
        effectiveFromBasis: 'ACTUAL',
        expectedEndDate: input.expectedEndDate,
        predecessorId: current.id,
        baselineImportId: null,
        createdByAppUserId: actor.appUserId,
      };
      let created: AssignmentRecord;
      try {
        created = await this.repo.insert(tx, base);
      } catch (error) {
        throw toAssignmentFailure(error, 0) ?? error;
      }
      const ended: AssignmentRecord = { ...current, validUntil: input.effectiveFrom };

      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'LICENSE_ASSIGNMENT.ENDED',
          'LicenseAssignment',
          current.id,
          { validUntil: null },
          { validUntil: input.effectiveFrom, successorId: created.id },
        ),
      );
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'LICENSE_ASSIGNMENT.CREATED',
          'LicenseAssignment',
          created.id,
          null,
          { ...recorded(created, null), predecessorId: current.id },
        ),
      );

      return { ended: toAssignmentView(ended), created: toAssignmentView(created) };
    });
  }

  /** The person who would take over, locked `FOR SHARE` so they cannot leave meanwhile; null when there is none. */
  private async lockHolder(tx: DbTx, employeeId: string, onDate: BusinessDate) {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return null;
      throw error;
    }
    const employee = await this.organization.getEmployee(employeeId, tx);

    if (!employee) return null;
    const unit = (await this.organization.getOwningUnits([employeeId], onDate, tx)).get(employeeId);

    return {
      status: employee.status,
      employmentType: employee.employmentType,
      departmentId: unit?.departmentId ?? null,
    };
  }
}

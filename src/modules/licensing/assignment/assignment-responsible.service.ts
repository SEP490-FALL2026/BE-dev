import { Injectable } from '@nestjs/common';
import { normalizeAccountIdentifier } from '../public/account-identifier.policy';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentNotFoundError } from '../public/licensing.errors';
import { ResponsibleDeadlineHook } from '../public/licensing.extension-points';
import type { ResponsibleHolder } from '../public/licensing-service-account.types';
import type { AssignmentRecord, AssignmentView } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { toAssignmentFailure } from './assignment-conflicts.repo';
import { assertResponsibleChange, assignmentCreatedSnapshot, toAssignmentView } from './assignment.policy';
import { AssignmentRepo, type NewAssignment } from './assignment.repo';

/** What the new assignment of a service account that passes on says: who, where it is owned and charged, and from which day. */
export interface Succession {
  employeeId: string;
  owningDepartmentId: string | null;
  costCenterId: string | null;
  effectiveFrom: BusinessDate;
  expectedEndDate: BusinessDate | null;
}

/**
 * Passing a service account to another person (`US-03-08`, `QĐ-43a`): the one place that ends the old assignment and opens the
 * next one, chained to it with the same kind, plan, subscription, identifier and reason, whether the account stays in its
 * department (the change of the person responsible) or goes to another (the confirmation of a move). Done in one transaction under
 * the lock of the subscription, so the seats taken do not change on any day.
 */
@Injectable()
export class AssignmentResponsibleService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly deadlines: ResponsibleDeadlineHook,
  ) {}

  /**
   * Passes an open service account to another person of the department that owns it from `effectiveFrom` (`AC-10`, `QĐ-43a`). It
   * grants no new seat, so it is allowed after the baseline is closed. Throws the errors of the policy, AssignmentNotFoundError
   * and AssignmentConflictError.
   */
  async changeResponsible(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate; expectedEndDate: BusinessDate | null },
  ): Promise<{ ended: AssignmentView; created: AssignmentView }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A service account changed hands before installation');
    const today = await this.organizationReads.businessToday();

    return this.runner.run(async (tx) => {
      const current = await this.lockAssignment(tx, assignmentId);
      const holder = await this.lockHolder(tx, input.employeeId, input.effectiveFrom);
      const [file] = await this.deadlines.get().listPending({ employeeIds: [current.employeeId], limit: 1 }, tx);
      assertResponsibleChange(current, input, holder, today, file?.dueOn ?? null);

      return this.succeed(tx, actor, organization.id, current, {
        employeeId: input.employeeId,
        owningDepartmentId: current.owningDepartmentId,
        costCenterId: current.costCenterId,
        effectiveFrom: input.effectiveFrom,
        expectedEndDate: input.expectedEndDate,
      });
    });
  }

  /**
   * The assignment, locked after its subscription as every writer of the seats does, so there is one order and no deadlock. Throws
   * AssignmentNotFoundError.
   */
  async lockAssignment(tx: DbTx, assignmentId: string): Promise<AssignmentRecord> {
    const probe = await this.repo.find(assignmentId, tx);
    if (!probe) throw new AssignmentNotFoundError();
    if (probe.subscriptionId) await this.catalog.lockSeatTarget(tx, { subscriptionId: probe.subscriptionId });
    const current = await this.repo.lock(tx, assignmentId);
    if (!current) throw new AssignmentNotFoundError();

    return current;
  }

  /** Ends `current` the day the next begins and opens the next, with the audit event of each. Throws AssignmentConflictError. */
  async succeed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    current: AssignmentRecord,
    next: Succession,
  ): Promise<{ ended: AssignmentView; created: AssignmentView }> {
    await this.repo.end(tx, current.id, next.effectiveFrom);
    const base: NewAssignment = {
      organizationId,
      source: 'HANDOVER',
      kind: current.kind,
      planId: current.planId,
      subscriptionId: current.subscriptionId,
      employeeId: next.employeeId,
      accountIdentifier: current.accountIdentifier,
      normalizedAccountIdentifier: normalizeAccountIdentifier(current.accountIdentifier),
      reason: current.reason,
      costCenterId: next.costCenterId,
      owningDepartmentId: next.owningDepartmentId,
      effectiveFrom: next.effectiveFrom,
      effectiveFromBasis: 'ACTUAL',
      expectedEndDate: next.expectedEndDate,
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
    const ended: AssignmentRecord = { ...current, validUntil: next.effectiveFrom };

    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organizationId,
        'LICENSE_ASSIGNMENT.ENDED',
        'LicenseAssignment',
        current.id,
        { validUntil: null },
        { validUntil: next.effectiveFrom, successorId: created.id },
      ),
    );
    await this.audit.record(
      tx,
      licensingAuditEvent(actor, organizationId, 'LICENSE_ASSIGNMENT.CREATED', 'LicenseAssignment', created.id, null, {
        ...assignmentCreatedSnapshot(created, null),
        owningDepartmentId: created.owningDepartmentId,
        predecessorId: current.id,
      }),
    );

    return { ended: toAssignmentView(ended), created: toAssignmentView(created) };
  }

  /** The person who would take over, locked `FOR SHARE` so they cannot leave meanwhile; null when there is none. */
  async lockHolder(tx: DbTx, employeeId: string, onDate: BusinessDate): Promise<ResponsibleHolder | null> {
    try {
      await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return null;
      throw error;
    }
    const employee = await this.organizationReads.getEmployee(employeeId, tx);

    if (!employee) return null;
    const unit = (await this.organizationReads.getOwningUnits([employeeId], onDate, tx)).get(employeeId);

    return {
      status: employee.status,
      workState: employee.workState,
      employmentType: employee.employmentType,
      departmentId: unit?.departmentId ?? null,
      costCenterId: unit?.costCenter?.id ?? null,
    };
  }
}

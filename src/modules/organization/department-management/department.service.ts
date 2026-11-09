import { Injectable } from '@nestjs/common';
import { normalizeDisplayName } from '../../../core/display-name';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { DepartmentUseService } from '../department/department-use.service';
import {
  DepartmentCreationWindowHook,
  DepartmentServiceAccountReaderHook,
} from '../public/organization.extension-points';
import { DepartmentItAdminService } from './department-it-admin.service';
import {
  DepartmentCodeInvalidError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutsideBudgetPeriodError,
  DepartmentUpdateEmptyError,
} from '../department/department.errors';
import { requireOrganization } from './department-facts.service';
import { assertMayChangeOrganization } from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import { isDepartmentCodeValid } from '../public/organization-code.policy';
import { DEPARTMENT_NAME_MAX_LENGTH } from '../department/department.types';

/** How many of each kind of thing that still keeps the department in use the refusal to retire it lists. */
const IN_USE_LISTED = 20;

/** The length of a function is bounded by the schema of the request (`API-DOC-F05`); here it is only composed and trimmed. */
const normalizeFunction = (raw: string | null | undefined): string | null => {
  // Free text keeps its line breaks: accents composed, the ends trimmed, nothing else.
  const text = raw === null || raw === undefined ? '' : raw.normalize('NFC').trim();

  return text === '' ? null : text;
};

/**
 * Department profiles (`US-03-06`, `US-01-11`): the Super Admin creates a department, with no Cost Center (Finance creates one for
 * it afterwards, `QĐ-87d(1)`), changes it, names who is in charge of its technical work and retires it once nothing keeps it in
 * use, with no HR basis to give (`QĐ-87a`, `QĐ-93f`): the Audit Trail records who, when, before and after. The IT Admin changes none of it. Who heads it is `DepartmentHeadService`;
 * what a profile shows is `DepartmentQueryService`; who may do what is `department.policy.ts`, run first in every use case.
 */
@Injectable()
export class DepartmentService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly context: OrganizationContextService,
    private readonly use: DepartmentUseService,
    private readonly serviceAccounts: DepartmentServiceAccountReaderHook,
    private readonly itAdmins: DepartmentItAdminService,
    private readonly creationWindow: DepartmentCreationWindowHook,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Creates a department with no Cost Center and returns its id: Finance creates the Cost Center for it afterwards, and it is
   * never changed by renaming the department or changing its head (AC-4). Throws
   * DepartmentForbiddenError, DepartmentNameInvalidError, DepartmentItAdminInvalidError, DepartmentCodeTakenError or
   * DepartmentOutsideBudgetPeriodError: a department is made only while the budget cycle of the next year was never published, and
   * takes effect on 1 January of that year (`QĐ-104e(3)`); with no cycle at all (the installation) it takes effect today.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: {
      code: string;
      name: string;
      functionDescription?: string | null;
      itAdminEmployeeId?: string | null;
    },
  ): Promise<string> {
    assertMayChangeOrganization(actor.roles);
    const name = this.requireName(input.name);
    const functionDescription = normalizeFunction(input.functionDescription);
    const code = input.code.trim().toUpperCase();
    if (!isDepartmentCodeValid(code)) throw new DepartmentCodeInvalidError();
    const organization = await requireOrganization(this.context);

    return this.runner.run(async (tx) => {
      if (input.itAdminEmployeeId) await this.itAdmins.assertUsable(tx, input.itAdminEmployeeId);
      const today = await this.context.businessToday(new Date(), tx);
      // Read in this transaction, the cycle `FOR SHARE`: a publication made at the same time waits for this department, or this waits for it.
      const window = await this.creationWindow.get().windowOn(tx, organization.id, today);
      if (window.kind === 'CLOSED') throw new DepartmentOutsideBudgetPeriodError();
      const effectiveFrom = window.kind === 'OPEN' ? window.effectiveFrom : today;

      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        code,
        name,
        functionDescription,
        itAdminEmployeeId: input.itAdminEmployeeId ?? null,
        effectiveFrom,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'DEPARTMENT.CREATED', 'Department', created, null, {
          code,
          name,
          function: functionDescription,
          itAdminEmployeeId: input.itAdminEmployeeId ?? null,
          effectiveFrom,
        }),
      );

      return created;
    });
  }

  /**
   * Renames a department, changes what it does or who is in charge of its technical work. Nothing here touches its Cost Center or
   * its members (AC-4). A change that changes nothing records nothing. Throws DepartmentForbiddenError.
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null },
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    if (input.name === undefined && input.functionDescription === undefined && input.itAdminEmployeeId === undefined) {
      throw new DepartmentUpdateEmptyError();
    }
    const name = input.name === undefined ? undefined : this.requireName(input.name);
    const functionDescription =
      input.functionDescription === undefined ? undefined : normalizeFunction(input.functionDescription);
    const organization = await requireOrganization(this.context);

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status !== 'ACTIVE') throw new DepartmentInactiveError();

      const changes: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null } = {};
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      if (name !== undefined && name !== current.name) {
        changes.name = name;
        before.name = current.name;
        after.name = name;
      }
      if (functionDescription !== undefined && functionDescription !== current.functionDescription) {
        changes.functionDescription = functionDescription;
        before.function = current.functionDescription;
        after.function = functionDescription;
      }
      if (input.itAdminEmployeeId !== undefined && input.itAdminEmployeeId !== (current.itAdmin?.employeeId ?? null)) {
        if (input.itAdminEmployeeId !== null) await this.itAdmins.assertUsable(tx, input.itAdminEmployeeId);
        changes.itAdminEmployeeId = input.itAdminEmployeeId;
        before.itAdminEmployeeId = current.itAdmin?.employeeId ?? null;
        after.itAdminEmployeeId = input.itAdminEmployeeId;
      }
      if (Object.keys(changes).length === 0) return;

      await this.repo.update(tx, id, changes, new Date());
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'DEPARTMENT.UPDATED', 'Department', id, before, after),
      );
    });
  }

  /**
   * Retires a department. Refused while anything keeps it in use, and the refusal lists each group with its first things and
   * its total (AC-19, `QĐ-90e`, `QĐ-86c`): the people in it, the service accounts it owns, the open work (Requests not over,
   * personnel events waiting, open tasks) and the subscriptions and purchases it owns that still owe a payment. What the
   * department was, who headed it and what was charged to it stay as they were. Already retired ⟹ the same answer. Throws
   * DepartmentForbiddenError, DepartmentNotFoundError or DepartmentInUseError.
   */
  async deactivate(actor: AuthenticatedPrincipal, id: string): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status === 'INACTIVE') return;

      const today = await this.context.businessToday();
      const members = await this.repo.members(tx, id, today, { skip: 0, take: IN_USE_LISTED });
      // A service account is owned by the department, not held by a member: it stays until its chain ends (`QĐ-86c`).
      const accounts = await this.serviceAccounts.get().ownedBy(id, today, IN_USE_LISTED, tx);
      const use = await this.use.readDepartment(id, today, IN_USE_LISTED, tx);
      if (members.total > 0 || accounts.total > 0 || use.openWork.total > 0 || use.subscriptions.total > 0) {
        throw new DepartmentInUseError({
          members: {
            items: members.items.map((member) => ({ employeeCode: member.employeeCode, fullName: member.fullName })),
            total: members.total,
          },
          serviceAccounts: accounts,
          openWork: use.openWork,
          subscriptions: use.subscriptions,
        });
      }

      await this.repo.deactivate(tx, id, new Date());
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.DEACTIVATED',
          'Department',
          id,
          { status: current.status },
          { status: 'INACTIVE' },
        ),
      );
    });
  }

  private requireName(raw: string): string {
    const name = normalizeDisplayName(raw);
    if (name === '' || [...name].length > DEPARTMENT_NAME_MAX_LENGTH) throw new DepartmentNameInvalidError();

    return name;
  }
}

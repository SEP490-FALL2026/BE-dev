import { Injectable } from '@nestjs/common';
import { normalizeDisplayName } from '../../../core/display-name';
import type { HrBasis } from '../../../core/hr-basis';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationApi } from '../public/organization.api';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import {
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentUpdateEmptyError,
} from './department.errors';
import { lockAndReadEmployee, requireOrganization } from './department-lookups.service';
import { assertMayChangeOrganization } from './department.policy';
import { DepartmentRepo } from './department.repo';

const DEPARTMENT_NAME_MAX_LENGTH = 200;
const DEPARTMENT_FUNCTION_MAX_LENGTH = 1000;
/** How many of each kind of thing that still keeps the department in use the refusal to retire it lists. */
const IN_USE_LISTED = 20;

const normalizeFunction = (raw: string | null | undefined): string | null => {
  // Free text keeps its line breaks: accents composed, the ends trimmed, nothing else.
  const text = raw === null || raw === undefined ? '' : raw.normalize('NFC').trim();

  return text === '' ? null : text;
};

/**
 * Department profiles (`US-03-06`, `US-01-11`): the Super Admin creates a department, with no Cost Center (Finance creates one for
 * it afterwards, `QĐ-87d(1)`), changes it, names who is in charge of its technical work and retires it once nothing keeps it in
 * use, always on an HR basis (`QĐ-87a`, `QĐ-87b(1)`). The IT Admin changes none of it. Who heads it is `DepartmentHeadService`;
 * what a profile shows is `DepartmentQueryService`; who may do what is `department.policy.ts`, run first in every use case.
 */
@Injectable()
export class DepartmentService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly organization: OrganizationApi,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Creates a department with no Cost Center and returns its id: Finance creates the Cost Center for it afterwards, and it is
   * never changed by renaming the department or changing its head (AC-4). The HR basis is recorded with the change. Throws
   * DepartmentForbiddenError, DepartmentNameInvalidError, DepartmentItAdminInvalidError or DepartmentCodeTakenError.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: {
      code: string;
      name: string;
      functionDescription?: string | null;
      itAdminEmployeeId?: string | null;
      hrBasis: HrBasis;
    },
  ): Promise<string> {
    assertMayChangeOrganization(actor.roles);
    const name = this.requireName(input.name);
    const functionDescription = this.requireFunction(input.functionDescription);
    const organization = await requireOrganization(this.organization);
    const code = input.code.trim();

    return this.runner.run(async (tx) => {
      if (input.itAdminEmployeeId) await this.assertUsableItAdmin(tx, input.itAdminEmployeeId);

      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        code,
        name,
        functionDescription,
        itAdminEmployeeId: input.itAdminEmployeeId ?? null,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'DEPARTMENT.CREATED', 'Department', created, null, {
          code,
          name,
          function: functionDescription,
          itAdminEmployeeId: input.itAdminEmployeeId ?? null,
          hrBasis: { ...input.hrBasis },
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
    input: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null; hrBasis: HrBasis },
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    if (input.name === undefined && input.functionDescription === undefined && input.itAdminEmployeeId === undefined) {
      throw new DepartmentUpdateEmptyError();
    }
    const name = input.name === undefined ? undefined : this.requireName(input.name);
    const functionDescription =
      input.functionDescription === undefined ? undefined : this.requireFunction(input.functionDescription);
    const organization = await requireOrganization(this.organization);

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
        if (input.itAdminEmployeeId !== null) await this.assertUsableItAdmin(tx, input.itAdminEmployeeId);
        changes.itAdminEmployeeId = input.itAdminEmployeeId;
        before.itAdminEmployeeId = current.itAdmin?.employeeId ?? null;
        after.itAdminEmployeeId = input.itAdminEmployeeId;
      }
      if (Object.keys(changes).length === 0) return;

      await this.repo.update(tx, id, changes, new Date());
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.UPDATED',
          'Department',
          id,
          before,
          // The basis the change is made on is part of what it says (`QĐ-87b(1)`).
          { ...after, hrBasis: { ...input.hrBasis } },
        ),
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
  async deactivate(actor: AuthenticatedPrincipal, id: string, input: { hrBasis: HrBasis }): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.organization);

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status === 'INACTIVE') return;

      const today = await this.organization.businessToday();
      const members = await this.repo.members(tx, id, today, { skip: 0, take: IN_USE_LISTED });
      // A service account is owned by the department, not held by a member: it stays until its chain ends (`QĐ-86c`).
      const accounts = await this.organization.getOwnedServiceAccounts(id, today, IN_USE_LISTED, tx);
      const use = await this.organization.getDepartmentUse(id, today, IN_USE_LISTED, tx);
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
          { status: 'INACTIVE', hrBasis: { ...input.hrBasis } },
        ),
      );
    });
  }

  private async assertUsableItAdmin(tx: DbTx, employeeId: string) {
    const employee = await lockAndReadEmployee(this.organization, tx, employeeId);
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new DepartmentItAdminInvalidError();
  }

  private requireName(raw: string): string {
    const name = normalizeDisplayName(raw);
    if (name === '' || [...name].length > DEPARTMENT_NAME_MAX_LENGTH) throw new DepartmentNameInvalidError();

    return name;
  }

  private requireFunction(raw: string | null | undefined): string | null {
    const text = normalizeFunction(raw);
    if (text !== null && [...text].length > DEPARTMENT_FUNCTION_MAX_LENGTH) throw new DepartmentNameInvalidError();

    return text;
  }
}

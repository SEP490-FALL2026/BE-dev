import { Injectable } from '@nestjs/common';
import { normalizeDisplayName } from '../../../core/display-name';
import type { HrBasis } from '../../../core/hr-basis';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { CostCenterService } from '../cost-center/cost-center.service';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationService } from '../organization.service';
import {
  DepartmentCreationAwaitingActivationError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentUpdateEmptyError,
} from './department.errors';
import { lockAndReadEmployee, requireOrganization } from './department-lookups';
import { DepartmentRepo } from './department.repo';

const DEPARTMENT_NAME_MAX_LENGTH = 200;
const DEPARTMENT_FUNCTION_MAX_LENGTH = 1000;
/** How many names of the people still in the department the refusal to retire it lists. */
const IN_USE_LISTED_MEMBERS = 20;

const normalizeFunction = (raw: string | null | undefined): string | null => {
  // Free text keeps its line breaks: accents composed, the ends trimmed, nothing else.
  const text = raw === null || raw === undefined ? '' : raw.normalize('NFC').trim();

  return text === '' ? null : text;
};

/**
 * Department profiles (`US-03-06`, `US-01-11`): the Super Admin creates a department, with no Cost Center (Finance
 * creates one for it afterwards, `QĐ-87d(1)`); the IT Admin names who is in charge of its technical work and retires it
 * once nobody is left in it. Who heads it is `DepartmentHeadService`; what a profile shows is `DepartmentQueryService`.
 */
@Injectable()
export class DepartmentService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly costCenters: CostCenterService,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Creates a department with no Cost Center and returns its id: Finance creates the Cost Center for it afterwards, and it
   * is never changed by renaming the department or changing its head (AC-4). The HR basis is recorded with the change
   * (`QĐ-87b`). Until the operator has activated the direction of the Cost Center link nothing is written (spec L.11).
   * Throws DepartmentCreationAwaitingActivationError, DepartmentNameInvalidError, DepartmentItAdminInvalidError or
   * DepartmentCodeTakenError.
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
    const name = this.requireName(input.name);
    const functionDescription = this.requireFunction(input.functionDescription);
    const organization = await requireOrganization(this.organization);
    const code = input.code.trim();

    return this.runner.run(async (tx) => {
      if (!(await this.costCenters.isDirectionActivated(tx))) {
        throw new DepartmentCreationAwaitingActivationError();
      }
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
   * Renames a department, changes what it does or who is in charge of its technical work. Nothing here touches
   * its Cost Center or its members (AC-4). A change that changes nothing records nothing.
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null },
  ): Promise<void> {
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
        organizationAuditEvent(actor, organization.id, 'DEPARTMENT.UPDATED', 'Department', id, before, after),
      );
    });
  }

  /**
   * Retires a department. Refused while anyone is still a member or a service account it owns is still open (AC-19,
   * `QĐ-86c`); open work (reviews, recommendations) joins this check when its slices exist.
   * What the department was, who headed it and what was charged to it stay as they were. Already retired ⟹ the same answer.
   */
  async deactivate(actor: AuthenticatedPrincipal, id: string): Promise<void> {
    const organization = await requireOrganization(this.organization);

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status === 'INACTIVE') return;

      const today = await this.organization.businessToday();
      const members = await this.repo.members(tx, id, today, { skip: 0, take: IN_USE_LISTED_MEMBERS });
      // A service account is owned by the department, not held by a member: it stays until its chain ends (`QĐ-86c`).
      const accounts = await this.organization.getOwnedServiceAccounts(id, today, IN_USE_LISTED_MEMBERS, tx);
      if (members.total > 0 || accounts.total > 0) {
        throw new DepartmentInUseError(
          members.items.map((member) => ({ employeeCode: member.employeeCode, fullName: member.fullName })),
          members.total,
          accounts.items,
          accounts.total,
        );
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

  private async assertUsableItAdmin(tx: DbTx, employeeId: string) {
    const employee = await lockAndReadEmployee(this.organization, tx, employeeId);
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.identity.inspectEmployeeAccount(tx, employeeId);
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

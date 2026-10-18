import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../core/business-date';
import { DbTx, TransactionRunner, readSqlState } from '../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { CostCenterRepo } from './cost-center.repo';
import { DepartmentRepo } from './department.repo';
import {
  DepartmentMemberRecord,
  DepartmentRecord,
  DepartmentStatus,
  DepartmentWarning,
  HeadPeriodRecord,
} from './department.types';
import {
  DepartmentCostCenterError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
} from './errors/department.errors';
import { displayJobTitleName } from './job-title-name';
import { organizationAuditEvent } from './organization-audit';
import { EmployeeNotFoundError } from './organization.errors';
import { OrganizationService } from './organization.service';

export const DEPARTMENT_NAME_MAX_LENGTH = 200;
export const DEPARTMENT_FUNCTION_MAX_LENGTH = 1000;
/** How many head periods a profile shows. */
const HEAD_HISTORY_LIMIT = 50;
/** How many names of the people still in the department the refusal to retire it lists. */
const IN_USE_LISTED_MEMBERS = 20;

export interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items,
  pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
});

export interface DepartmentView extends DepartmentRecord {
  head: { employeeId: string; employeeCode: string; fullName: string; since: BusinessDate } | null;
  memberCount: number;
  warnings: DepartmentWarning[];
  /** Whether the IT Admin named still holds the role on a usable account. Meaningful only when `itAdmin` is set. */
  itAdminUsable: boolean;
}

export interface DepartmentProfileView extends DepartmentView {
  headHistory: HeadPeriodRecord[];
  projects: Awaited<ReturnType<DepartmentRepo['listProjects']>>;
}

export interface DepartmentWarningItem {
  departmentId: string;
  code: string;
  name: string;
  warning: DepartmentWarning;
}

const normalizeFunction = (raw: string | null | undefined): string | null => {
  // Free text keeps its line breaks: accents composed, the ends trimmed, nothing else.
  const text = raw === null || raw === undefined ? '' : raw.normalize('NFC').trim();

  return text === '' ? null : text;
};

/**
 * Department profiles (`US-03-06`, `US-01-11`): the IT Admin creates a department on a free `UNIT` Cost Center,
 * names who is in charge of its technical work, and says who heads it. The head is a member of the department
 * (`QĐ-66a`); a department with nobody heading it is allowed and shows as a warning (AC-9).
 */
@Injectable()
export class DepartmentService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly costCenters: CostCenterRepo,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  // --- reads --------------------------------------------------------------------------

  async list(query: {
    status?: DepartmentStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<DepartmentView>> {
    const search = query.search ? displayJobTitleName(query.search) : '';
    const { items, total } = await this.repo.list({
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.toViews(items), total, query.page, query.pageSize);
  }

  /** The profile of one department. A department head sees only their own (US-03-06 AC-17). */
  async profile(principal: AuthenticatedPrincipal, id: string): Promise<DepartmentProfileView> {
    const record = await this.repo.findById(id);
    if (!record) throw new DepartmentNotFoundError();
    await this.assertMayRead(principal, id);

    const [view] = await this.toViews([record]);

    return {
      ...view,
      headHistory: await this.repo.headPeriods(undefined, id, HEAD_HISTORY_LIMIT),
      projects: await this.repo.listProjects(id),
    };
  }

  async members(
    principal: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<DepartmentMemberRecord>> {
    if (!(await this.repo.findById(id))) throw new DepartmentNotFoundError();
    await this.assertMayRead(principal, id);

    const today = await this.organization.businessToday();
    const { items, total } = await this.repo.members(undefined, id, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Every active department that needs attention, for the IT Admin and the Super Admin (US-03-06 AC-9, AC-15). */
  async warnings(): Promise<DepartmentWarningItem[]> {
    const today = await this.organization.businessToday();
    const [withoutHead, withItAdmin] = await Promise.all([
      this.repo.activeDepartmentsWithoutHead(today),
      this.repo.activeDepartmentsWithItAdmin(),
    ]);
    const usable = await this.identity.findUsableItAdminEmployeeIds(
      withItAdmin.flatMap((department) => (department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [])),
    );
    const items: DepartmentWarningItem[] = [
      ...withoutHead.map((department) => ({
        departmentId: department.id,
        code: department.code,
        name: department.name,
        warning: 'MISSING_HEAD' as const,
      })),
      ...withItAdmin
        .filter(
          (department) =>
            department.itAdminEmployeeId === null ||
            department.itAdminStatus !== 'ACTIVE' ||
            !usable.has(department.itAdminEmployeeId),
        )
        .map((department) => ({
          departmentId: department.id,
          code: department.code,
          name: department.name,
          warning: 'MISSING_IT_ADMIN' as const,
        })),
    ];

    return items.sort((a, b) => (a.code === b.code ? a.warning.localeCompare(b.warning) : a.code < b.code ? -1 : 1));
  }

  // --- changes ------------------------------------------------------------------------

  /**
   * Creates a department on a `UNIT` Cost Center that is in use and has no department (AC-1, AC-2). The Cost Center
   * follows from the department and is never changed by renaming it or changing its head (AC-4).
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: {
      code: string;
      name: string;
      functionDescription?: string | null;
      costCenterId: string;
      itAdminEmployeeId?: string | null;
    },
  ): Promise<DepartmentProfileView> {
    const name = this.requireName(input.name);
    const functionDescription = this.requireFunction(input.functionDescription);
    const organization = await this.requireOrganization();
    const code = input.code.trim();

    const id = await this.runner.run(async (tx) => {
      // Lock order (T-11): the cost center, the new department, then the people it names.
      const costCenter = await this.costCenters.lock(tx, input.costCenterId, 'SHARE');
      if (!costCenter) throw new DepartmentCostCenterError('NOT_FOUND');
      if (costCenter.kind !== 'UNIT') throw new DepartmentCostCenterError('NOT_UNIT');
      if (costCenter.status !== 'ACTIVE') throw new DepartmentCostCenterError('INACTIVE');
      if (costCenter.department) throw new DepartmentCostCenterError('TAKEN');
      if (input.itAdminEmployeeId) await this.assertUsableItAdmin(tx, input.itAdminEmployeeId);

      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        code,
        name,
        functionDescription,
        costCenterId: costCenter.id,
        itAdminEmployeeId: input.itAdminEmployeeId ?? null,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'DEPARTMENT.CREATED', 'Department', created, null, {
          code,
          name,
          function: functionDescription,
          costCenter: costCenter.code,
          itAdminEmployeeId: input.itAdminEmployeeId ?? null,
        }),
      );

      return created;
    });

    return this.profile(actor, id);
  }

  /**
   * Renames a department, changes what it does or who is in charge of its technical work. Nothing here touches
   * its Cost Center or its members (AC-4). A change that changes nothing records nothing.
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null },
  ): Promise<DepartmentProfileView> {
    if (input.name === undefined && input.functionDescription === undefined && input.itAdminEmployeeId === undefined) {
      throw new DepartmentUpdateEmptyError();
    }
    const name = input.name === undefined ? undefined : this.requireName(input.name);
    const functionDescription =
      input.functionDescription === undefined ? undefined : this.requireFunction(input.functionDescription);
    const organization = await this.requireOrganization();

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

    return this.profile(actor, id);
  }

  /**
   * Retires a department. Refused while anyone is still a member (AC-19); open work (reviews, recommendations) joins
   * this check when its slices exist. Shared accounts are not a case: the system manages none (QĐ-75).
   * What the department was, who headed it and what was charged to it stay as they were. Already retired ⟹ the same answer.
   */
  async deactivate(actor: AuthenticatedPrincipal, id: string): Promise<DepartmentProfileView> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status === 'INACTIVE') return;

      const today = await this.organization.businessToday();
      const members = await this.repo.members(tx, id, today, { skip: 0, take: IN_USE_LISTED_MEMBERS });
      if (members.total > 0) {
        throw new DepartmentInUseError(
          members.items.map((member) => ({ employeeCode: member.employeeCode, fullName: member.fullName })),
          members.total,
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

    return this.profile(actor, id);
  }

  // --- heads --------------------------------------------------------------------------

  /**
   * Names the head of the department from `effectiveFrom` (today or later): the head before ends the day before,
   * so the two never overlap and on each day there is one head (AC-5). The person must be a member of this
   * department on that day (AC-18), must not hold the Super Admin role (AC-7), and must not have left (AC-8).
   * Naming the person who already heads it from that day changes nothing.
   */
  async assignHead(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { employeeId: string; effectiveFrom: BusinessDate },
  ): Promise<DepartmentProfileView> {
    const organization = await this.requireOrganization();
    const today = await this.organization.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      // Lock order (T-11, protocol): the department, then the employee, then the account.
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();
      if (department.status !== 'ACTIVE') throw new DepartmentInactiveError();

      const employee = await this.lockEmployee(tx, input.employeeId);
      if (!employee) throw new HeadAssignmentError('EMPLOYEE_NOT_FOUND');
      if (employee.status !== 'ACTIVE') throw new HeadAssignmentError('EMPLOYEE_NOT_ACTIVE');
      const account = await this.identity.inspectEmployeeAccount(tx, input.employeeId);
      if (account.roles.includes('SUPER_ADMIN')) throw new HeadAssignmentError('SUPER_ADMIN_CANNOT_HEAD');
      const placement = await this.repo.placementOn(tx, input.employeeId, input.effectiveFrom);
      if (!placement || placement.departmentId !== departmentId || placement.validTo !== null) {
        throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
      }

      const periods = await this.repo.headPeriods(tx, departmentId, HEAD_HISTORY_LIMIT);
      const inForce = periods.find(
        (period) =>
          period.validFrom <= input.effectiveFrom && (period.validTo === null || period.validTo > input.effectiveFrom),
      );
      const alreadyHead = inForce?.employeeId === input.employeeId && inForce.validTo === null;
      const laterPeriods = periods.some((period) => period.validFrom > input.effectiveFrom);
      if (alreadyHead && !laterPeriods) return;

      const room = await this.repo.makeRoomForHead(tx, departmentId, input.effectiveFrom);
      try {
        await this.repo.insertHeadPeriod(tx, {
          organizationId: organization.id,
          departmentId,
          employeeId: input.employeeId,
          validFrom: input.effectiveFrom,
        });
      } catch (error) {
        // The person already heads another department over some of these days (INV-19).
        if (readSqlState(error) === '23P01') throw new HeadAssignmentError('HEADS_ANOTHER_DEPARTMENT');
        if (isCheckViolation(error)) throw new HeadAssignmentError('NOT_A_MEMBER_ON_DATE');
        throw error;
      }
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.HEAD_ASSIGNED',
          'Department',
          departmentId,
          { head: inForce?.employeeCode ?? null },
          {
            head: employee.employeeCode,
            effectiveFrom: input.effectiveFrom,
            endedPeriods: room.ended.length,
            cancelledPeriods: room.cancelled.map((period) => `${period.employeeCode}@${period.validFrom}`),
          },
        ),
      );
    });

    return this.profile(actor, departmentId);
  }

  /** Records that nobody heads the department from `effectiveFrom` (AC-9). Nothing to end ⟹ nothing changes. */
  async vacateHead(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { effectiveFrom: BusinessDate },
  ): Promise<DepartmentProfileView> {
    const organization = await this.requireOrganization();
    const today = await this.organization.businessToday();
    if (input.effectiveFrom < today) throw new HeadAssignmentError('DATE_IN_PAST');

    await this.runner.run(async (tx) => {
      const department = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!department) throw new DepartmentNotFoundError();

      const periods = await this.repo.headPeriods(tx, departmentId, HEAD_HISTORY_LIMIT);
      const inForce = periods.find(
        (period) =>
          period.validFrom <= input.effectiveFrom && (period.validTo === null || period.validTo > input.effectiveFrom),
      );
      const room = await this.repo.makeRoomForHead(tx, departmentId, input.effectiveFrom);
      if (room.ended.length === 0 && room.cancelled.length === 0) return;

      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.HEAD_VACATED',
          'Department',
          departmentId,
          { head: inForce?.employeeCode ?? null },
          {
            head: null,
            effectiveFrom: input.effectiveFrom,
            cancelledPeriods: room.cancelled.map((period) => `${period.employeeCode}@${period.validFrom}`),
          },
        ),
      );
    });

    return this.profile(actor, departmentId);
  }

  // --- helpers ------------------------------------------------------------------------

  /** IT Admin sees any department; a department head sees only the one they head (AC-17). */
  private async assertMayRead(principal: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    if (principal.roles.includes('IT_ADMIN')) return;

    const today = await this.organization.businessToday();
    const headed = await this.repo.headedDepartment(principal.employeeId, today);
    if (headed?.departmentId !== departmentId) throw new DepartmentOutOfScopeError();
  }

  private async toViews(records: DepartmentRecord[]): Promise<DepartmentView[]> {
    const today = await this.organization.businessToday();
    const ids = records.map((record) => record.id);
    const [heads, counts] = await Promise.all([this.repo.currentHeads(ids, today), this.repo.memberCounts(ids, today)]);
    const itAdminIds = records.flatMap((record) => (record.itAdmin ? [record.itAdmin.employeeId] : []));
    const usable = await this.identity.findUsableItAdminEmployeeIds(itAdminIds);

    return records.map((record) => {
      const head = heads.get(record.id) ?? null;
      const itAdminUsable =
        record.itAdmin !== null && record.itAdmin.employeeStatus === 'ACTIVE' && usable.has(record.itAdmin.employeeId);
      const warnings: DepartmentWarning[] =
        record.status === 'ACTIVE'
          ? [...(head ? [] : (['MISSING_HEAD'] as const)), ...(itAdminUsable ? [] : (['MISSING_IT_ADMIN'] as const))]
          : [];

      return { ...record, head, memberCount: counts.get(record.id) ?? 0, warnings, itAdminUsable };
    });
  }

  /** Locks the employee (`FOR SHARE`: still there, not changed, until commit) and reads it. Null when there is none. */
  private async lockEmployee(tx: DbTx, employeeId: string) {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return null;
      throw error;
    }

    return this.organization.getEmployee(employeeId, tx);
  }

  private async assertUsableItAdmin(tx: DbTx, employeeId: string) {
    const employee = await this.lockEmployee(tx, employeeId);
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.identity.inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new DepartmentItAdminInvalidError();
  }

  private requireName(raw: string): string {
    const name = displayJobTitleName(raw);
    if (name === '' || [...name].length > DEPARTMENT_NAME_MAX_LENGTH) throw new DepartmentNameInvalidError();

    return name;
  }

  private requireFunction(raw: string | null | undefined): string | null {
    const text = normalizeFunction(raw);
    if (text !== null && [...text].length > DEPARTMENT_FUNCTION_MAX_LENGTH) throw new DepartmentNameInvalidError();

    return text;
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Departments were used before installation');

    return organization;
  }
}

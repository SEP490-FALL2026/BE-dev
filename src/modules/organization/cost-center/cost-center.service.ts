import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { businessDateAt } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  COST_CENTER_NAME_MAX_LENGTH,
  displayCostCenterName,
  isReservedCostCenterName,
} from './cost-center-name.policy';
import { assertMayMaintainCostCenters, assertMayReadCostCenters } from './cost-center.policy';
import { CostCenterRepo } from './cost-center.repo';
import { CostCenterKind, CostCenterRecord, CostCenterStatus } from './cost-center.types';
import {
  CostCenterDepartmentAlreadyLinkedError,
  CostCenterDepartmentNotActiveError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from './cost-center.errors';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationApi } from '../public/organization.api';

/** How many of each kind of open obligation the refusal to retire a cost center lists. */
const IN_USE_LISTED = 20;

/**
 * The Cost Center catalogue Finance maintains (`US-04-09`). Finance creates, renames and retires; the Super Admin, who owns the
 * departments, may read it; the IT Admin has no operation on it (`QĐ-87a`). Who may do what is `cost-center.policy.ts`, run first in
 * every use case. A code is never reused or renamed, and a cost center is retired, never deleted, so what was charged to it stays
 * where it was (AC-10, AC-11).
 */
@Injectable()
export class CostCenterService {
  constructor(
    private readonly repo: CostCenterRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws CostCenterForbiddenError for a caller who is neither Finance nor the Super Admin. */
  async list(
    actor: AuthenticatedPrincipal,
    query: {
      status?: CostCenterStatus;
      kind?: CostCenterKind;
      search?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<CostCenterRecord>> {
    assertMayReadCostCenters(actor.roles);
    const search = query.search ? displayCostCenterName(query.search) : '';
    const { items, total } = await this.repo.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(search ? { search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * Creates the Cost Center for a department that exists and is in use, and links it in the same insert (`QĐ-87d(1)`,
   * `QĐ-87d(3)`: it is the department's current one from this moment, nothing before is charged to it). The department row is
   * locked first, so two creations for one department meet there. Throws CostCenterForbiddenError,
   * CostCenterKindNotSupportedError, CostCenterNameInvalidError, CostCenterNameReservedError,
   * CostCenterDepartmentNotActiveError, CostCenterDepartmentAlreadyLinkedError or CostCenterCodeTakenError.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: { code: string; name: string; kind: string; departmentId: string },
  ): Promise<CostCenterRecord> {
    assertMayMaintainCostCenters(actor.roles);
    const kind = this.requireKind(input.kind);
    const name = this.requireName(input.name);
    // The shape of the code is the body schema's to judge; here it only has to be kept as sent, trimmed.
    const code = input.code.trim();
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const department = await this.repo.lockDepartmentForCostCenter(tx, organization.id, input.departmentId);
      if (!department || !department.active) throw new CostCenterDepartmentNotActiveError();
      if (department.hasCostCenterInUse) throw new CostCenterDepartmentAlreadyLinkedError(department.id);

      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        code,
        name,
        kind,
        departmentId: department.id,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'COST_CENTER.CREATED', 'CostCenter', created.id, null, {
          code: created.code,
          name: created.name,
          kind: created.kind,
          status: created.status,
          departmentId: department.id,
        }),
      );

      return created;
    });
  }

  /** Changes the name; the code stays. The same name again changes nothing and records nothing. */
  async rename(actor: AuthenticatedPrincipal, id: string, rawName: string): Promise<CostCenterRecord> {
    assertMayMaintainCostCenters(actor.roles);
    const name = this.requireName(rawName);
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new CostCenterNotFoundError();
      if (current.name === name) return current;

      await this.repo.rename(tx, id, name, new Date());
      const renamed = (await this.repo.findById(id, tx)) as CostCenterRecord;
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'COST_CENTER.RENAMED',
          'CostCenter',
          id,
          { name: current.name },
          { name: renamed.name },
        ),
      );

      return renamed;
    });
  }

  /**
   * Stops the cost center being chosen for a department (`QĐ-87d(2)`). Refused while open obligations sit on it: Requests with a
   * cost that are not over and commitments still held; the refusal lists each group with its first things and its total. The people
   * in the department are not an obligation (AC-3). What was charged to the cost center before stays charged to it, and the
   * department goes back to a finance configuration that is incomplete until Finance creates a new one. The cost center row is
   * locked first, so a Request that takes it `FOR SHARE` and this meet there, and the obligations are read after the lock. Already
   * retired ⟹ the same answer, nothing recorded. Throws CostCenterForbiddenError, CostCenterNotFoundError or CostCenterInUseError.
   */
  async deactivate(actor: AuthenticatedPrincipal, id: string): Promise<CostCenterRecord> {
    assertMayMaintainCostCenters(actor.roles);
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new CostCenterNotFoundError();
      if (current.status === 'INACTIVE') return current;

      const open = await this.organization.getCostCenterUse(id, IN_USE_LISTED, tx);
      if (open.requests.total > 0 || open.commitments.total > 0)
        throw new CostCenterInUseError(current.department, open);

      await this.repo.deactivate(tx, id, new Date());
      const retired = (await this.repo.findById(id, tx)) as CostCenterRecord;
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'COST_CENTER.DEACTIVATED',
          'CostCenter',
          id,
          { status: current.status },
          { status: retired.status },
        ),
      );

      return retired;
    });
  }

  /**
   * Who is in the cost center's scope today, as little as Finance may see (AC-6, `QĐ-41c`): the code, the name and
   * that the person is working. A cost center whose department is gone has no people.
   */
  async employees(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<
    Page<{ employeeCode: string; fullName: string; status: 'WORKING' }> & { costCenter: { id: string; code: string } }
  > {
    assertMayMaintainCostCenters(actor.roles);
    const organization = await this.requireOrganization();
    const costCenter = await this.repo.findById(id);
    if (!costCenter) throw new CostCenterNotFoundError();

    const today = businessDateAt(new Date(), organization.timeZone);
    const members = costCenter.department
      ? await this.repo.currentMembersOfDepartment(undefined, costCenter.department.id, today, {
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        })
      : { items: [], total: 0 };

    return {
      costCenter: { id: costCenter.id, code: costCenter.code },
      ...pageOf(
        members.items.map((member) => ({ ...member, status: 'WORKING' as const })),
        members.total,
        query.page,
        query.pageSize,
      ),
    };
  }

  private requireKind(kind: string): CostCenterKind {
    if (kind !== 'UNIT') throw new CostCenterKindNotSupportedError();

    return kind;
  }

  private requireName(raw: string): string {
    const name = displayCostCenterName(raw);
    if (name === '' || [...name].length > COST_CENTER_NAME_MAX_LENGTH) throw new CostCenterNameInvalidError();
    if (isReservedCostCenterName(name)) throw new CostCenterNameReservedError();

    return name;
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The cost center catalogue was used before installation');

    return organization;
  }
}

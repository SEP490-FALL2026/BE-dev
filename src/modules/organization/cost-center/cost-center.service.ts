import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { COST_CENTER_NAME_MAX_LENGTH, displayCostCenterName, isReservedCostCenterName } from './cost-center-name';
import { CostCenterRepo } from './cost-center.repo';
import { CostCenterKind, CostCenterRecord, CostCenterStatus } from './cost-center.types';
import {
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from './cost-center.errors';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationService } from '../organization.service';

/** How many names of the people still in the department the refusal to retire a cost center lists. */
const IN_USE_LISTED_EMPLOYEES = 20;

export interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items,
  pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
});

/**
 * The Cost Center catalogue Finance maintains (`US-04-09`). Finance creates, renames and retires; IT Admin only
 * reads it, to pick a free `UNIT` when creating a department. A code is never reused or renamed, and a cost center
 * is retired, never deleted, so what was charged to it stays where it was (AC-10, AC-11).
 */
@Injectable()
export class CostCenterService {
  constructor(
    private readonly repo: CostCenterRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * `FOR SHARE` on the cost center a new department takes (it must stay as it is until the department commits;
   * lock order T-11: the cost center first), then its row; null when it does not exist. The department judges it.
   */
  lockForDepartment(tx: DbTx, costCenterId: string): Promise<CostCenterRecord | null> {
    return this.repo.lock(tx, costCenterId, 'SHARE');
  }

  async list(query: {
    status?: CostCenterStatus;
    kind?: CostCenterKind;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<CostCenterRecord>> {
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

  /** Throws CostCenterKindNotSupportedError, CostCenterNameInvalidError, CostCenterNameReservedError or CostCenterCodeTakenError. */
  async create(
    actor: AuthenticatedPrincipal,
    input: { code: string; name: string; kind: string },
  ): Promise<CostCenterRecord> {
    const kind = this.requireKind(input.kind);
    const name = this.requireName(input.name);
    // The shape of the code is the body schema's to judge; here it only has to be kept as sent, trimmed.
    const code = input.code.trim();
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const created = await this.repo.insert(tx, { organizationId: organization.id, code, name, kind });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, organization.id, 'COST_CENTER.CREATED', 'CostCenter', created.id, null, {
          code: created.code,
          name: created.name,
          kind: created.kind,
          status: created.status,
        }),
      );

      return created;
    });
  }

  /** Changes the name; the code stays. The same name again changes nothing and records nothing. */
  async rename(actor: AuthenticatedPrincipal, id: string, rawName: string): Promise<CostCenterRecord> {
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
   * Stops the cost center being chosen for a department. Refused while the department charged to it still has
   * people in it (AC-3); a department with nobody left may be released (AC-10, AC-11), and what was charged to
   * the cost center before stays charged to it. Already retired ⟹ the same answer, nothing recorded.
   */
  async deactivate(actor: AuthenticatedPrincipal, id: string): Promise<CostCenterRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      // Lock order (T-11): the cost center, then the department charged to it, then the people.
      const current = await this.repo.lock(tx, id, 'UPDATE');
      if (!current) throw new CostCenterNotFoundError();
      if (current.status === 'INACTIVE') return current;

      if (current.department) {
        await this.repo.lockDepartmentOf(tx, id);
        const today = businessDateAt(new Date(), organization.timeZone);
        const members = await this.repo.currentMembersOfDepartment(tx, current.department.id, today, {
          skip: 0,
          take: IN_USE_LISTED_EMPLOYEES,
        });
        if (members.total > 0) throw new CostCenterInUseError(current.department, members.items, members.total);
      }

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
   * that the person is working. A `COMPANY` cost center has no department and so no people.
   */
  async employees(
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<
    Page<{ employeeCode: string; fullName: string; status: 'WORKING' }> & { costCenter: { id: string; code: string } }
  > {
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
    if (kind !== 'UNIT' && kind !== 'COMPANY') throw new CostCenterKindNotSupportedError();

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

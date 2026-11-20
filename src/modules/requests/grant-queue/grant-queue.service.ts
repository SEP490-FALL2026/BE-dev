import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { PlanSummaryWithLogo } from '../../catalog/public/catalog.types';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { GrantExecution } from '../../licensing/public/licensing-open-grants.types';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import type { PlanStock } from '../../licensing/public/licensing.types';
import { LicensingPoolStockApi } from '../../licensing/public/licensing-pool-stock.api';
import type { DepartmentBrief } from '../../organization/public/organization.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { GrantQueueItemWire } from './grant-queue.dto';
import { executionOf } from './grant-queue.mapper';
import { GrantQueueRepo, type GrantQueueState, type WaitingRequestRow } from './grant-queue.repo';

const emptyLookups = {
  plans: new Map<string, PlanSummaryWithLogo>(),
  departments: new Map<string, DepartmentBrief>(),
  stocks: new Map<string, PlanStock>(),
  tasks: new Map<string, GrantExecution[]>(),
  person: (id: string): never => {
    throw new Error(`The employee ${id} of a request to carry out does not exist.`);
  },
  beneficiary: (id: string): never => {
    throw new Error(`The employee ${id} of a request to carry out does not exist.`);
  },
};

/**
 * The approved requests the IT Admin carries out, person by person (`US-03-02` AC-6, `QĐ-111m`): each says where the grant of its person
 * stands and, once a task exists, which task and what may be done to it. Only the departments the IT Admin works are read (the ones that
 * name them in charge, and the ones nobody usable is in charge of, R-20); a filter that names a person outside them is an empty answer, as it
 * is for any filter outside the scope (D8). It only reads: the grant itself is the grant of a seat (`US-07-01`).
 */
@Injectable()
export class GrantQueueService {
  constructor(
    private readonly queue: GrantQueueRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly poolStock: LicensingPoolStockApi,
    private readonly grants: LicensingOpenGrantsApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: {
      beneficiaryEmployeeId?: string;
      planId?: string;
      state?: GrantQueueState;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<GrantQueueItemWire>> {
    const departmentIds = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    if (departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.queue.page(
      {
        departmentIds,
        ...(query.beneficiaryEmployeeId ? { beneficiaryEmployeeId: query.beneficiaryEmployeeId } : {}),
        ...(query.planId ? { planId: query.planId } : {}),
        ...(query.state ? { state: query.state } : {}),
      },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const lookups = await this.lookupsOf(rows);
    const items = rows.flatMap((row) => {
      // A request always names a plan and a department that exist; one that cannot be read is corrupt data, not a row to leave out (the
      // total counts it, so a page shorter than its size would lie to the client), as for the person.
      const plan = lookups.plans.get(row.planId);
      const department = lookups.departments.get(row.departmentId);
      if (!plan) throw new Error(`The plan ${row.planId} of a request to carry out does not exist.`);
      if (!department) throw new Error(`The department ${row.departmentId} of a request to carry out does not exist.`);

      return [
        {
          requestId: row.id,
          type: row.type,
          state: row.state,
          boundaryState: row.boundaryState,
          lineCount: row.lineCount,
          plan: {
            planId: plan.planId,
            planName: plan.planName,
            applicationName: plan.applicationName,
            logoUrl: plan.applicationLogoUrl,
          },
          department: { id: department.id, name: department.name },
          beneficiary: lookups.beneficiary(row.beneficiaryEmployeeId),
          requester: lookups.person(row.requesterEmployeeId),
          expectedEndDate: row.expectedEndDate,
          submittedAt: row.submittedAt.toISOString(),
          stock: lookups.stocks.get(row.planId) ?? { kind: 'NONE' as const, free: 0, inRevocation: 0 },
          execution: executionOf(row, lookups.tasks.get(row.id) ?? []),
        },
      ];
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
  /** The plans, the people, the departments, the stock and the grant tasks of a page, one read of each kind whatever its size. */
  private async lookupsOf(rows: readonly WaitingRequestRow[]) {
    if (rows.length === 0) return emptyLookups;
    const planIds = [...new Set(rows.map((row) => row.planId))];
    const begun = [...new Set(rows.filter((row) => row.state !== 'WAITING').map((row) => row.id))];
    const [plans, people, departments, stocks, executions] = await Promise.all([
      this.catalog.getPlanSummariesWithLogo(planIds),
      this.organizationReads.getEmployees([
        ...new Set(rows.flatMap((row) => [row.requesterEmployeeId, row.beneficiaryEmployeeId])),
      ]),
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))]),
      this.poolStock.getStockOfPlans(planIds),
      this.grants.listGrantExecutionsOfRequests(begun),
    ]);
    const tasks = new Map<string, GrantExecution[]>();
    for (const execution of executions)
      tasks.set(execution.requestId, [...(tasks.get(execution.requestId) ?? []), execution]);
    const personById = new Map(people.map((employee) => [employee.id, employee]));

    const personOf = (id: string) => {
      const found = personById.get(id);
      if (!found) throw new Error(`The employee ${id} of a request to carry out does not exist.`);

      return found;
    };

    return {
      plans: new Map(plans.map((plan) => [plan.planId, plan])),
      departments: new Map(departments.map((department) => [department.id, department])),
      stocks,
      tasks,
      person: (id: string) => {
        const found = personOf(id);

        return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
      },
      /** The person to grant to, with the work email the grant will go to (`QĐ-87b`): the requester never carries it. */
      beneficiary: (id: string) => {
        const found = personOf(id);

        return {
          employeeId: found.id,
          employeeCode: found.employeeCode,
          fullName: found.fullName,
          workEmail: found.workEmail,
        };
      },
    };
  }
}

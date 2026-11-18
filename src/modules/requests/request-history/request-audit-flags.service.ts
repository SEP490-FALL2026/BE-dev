import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RequestAuditFlagItemWire } from './request-history.dto';
import { RequestHistoryRepo } from './request-history.repo';
import type { AuditFlagRow, RequestAuditFlag } from './request-history.types';

type RoutingReason = RequestAuditFlagItemWire['routingReason'];

/**
 * The audit report of the Super Admin (`US-05-24` AC-4, `SoD-1`): the requests no head approved the need of, because free internal
 * software was sent through the one-step route (the requester heads the department, or it has no head), with who sent it, from where,
 * for which software, why, and who granted it and when. The Super Admin only reads the flag: no price, amount, budget, evidence or
 * reason the requester wrote, and no action on the request. The page is read in a number of statements that does not grow with it.
 */
@Injectable()
export class RequestAuditFlagsService {
  constructor(
    private readonly repo: RequestHistoryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async page(query: {
    flag: RequestAuditFlag;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<RequestAuditFlagItemWire>> {
    const { rows, total } = await this.repo.auditFlagPage({
      from: query.from === undefined ? undefined : new Date(query.from),
      to: query.to === undefined ? undefined : new Date(query.to),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    if (rows.length === 0) return pageOf([], total, query.page, query.pageSize);
    const { departments, plans, completions, accounts, people } = await this.lookupsOf(rows);
    const departmentOf = new Map(departments.map((department) => [department.id, department]));
    const planOf = new Map(plans.map((plan) => [plan.planId, plan]));

    return pageOf(
      rows.map((row): RequestAuditFlagItemWire => {
        const requester = people.get(row.requesterEmployeeId);
        const department = departmentOf.get(row.departmentId);
        const plan = row.planId === null ? undefined : planOf.get(row.planId);
        if (!requester || !department || !plan)
          throw new Error(`The flagged request ${row.id} points at a missing record.`);
        const done = completions.get(row.id);
        const itAdmin = done?.completedByAppUserId ? accounts.get(done.completedByAppUserId) : undefined;

        return {
          requestId: row.id,
          flag: query.flag,
          submittedAt: row.submittedAt.toISOString(),
          state: row.state as RequestAuditFlagItemWire['state'],
          requester,
          department: { id: department.id, code: department.code, name: department.name },
          application: { id: plan.applicationId, name: plan.applicationName },
          plan: { id: plan.planId, name: plan.planName },
          routingReason: row.oneStepReason as RoutingReason,
          grant: done
            ? {
                itAdmin: (itAdmin === undefined ? undefined : people.get(itAdmin)) ?? null,
                completedAt: done.completedAt.toISOString(),
              }
            : null,
        };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The departments, plans, grant completions and people of the page, read once for it. */
  private async lookupsOf(rows: readonly AuditFlagRow[]) {
    const planIds = [...new Set(rows.flatMap((row) => (row.planId === null ? [] : [row.planId])))];
    const [departments, plans, completions] = await Promise.all([
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))]),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.grants.listGrantCompletionsOfRequests(rows.map((row) => row.id)),
    ]);
    const accounts = await this.identity.employeeIdsOfAccounts([
      ...new Set([...completions.values()].flatMap((done) => done.completedByAppUserId ?? [])),
    ]);
    const found = await this.organizationReads.getEmployees([
      ...new Set([...rows.map((row) => row.requesterEmployeeId), ...accounts.values()]),
    ]);
    const people = new Map(
      found.map((person) => [
        person.id,
        { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
      ]),
    );

    return { departments, plans, completions, accounts, people };
  }
}

import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { toSummary, type MyRequestLookups, type RequestSummaryCore } from '../my-requests/my-requests.mapper';
import { parseStateList, statesOf } from '../my-requests/my-requests.policy';
import { MyRequestsFactsRepo } from '../my-requests/my-requests-facts.repo';
import { MyRequestsService, type MyRequestsQuery } from '../my-requests/my-requests.service';
import type { MyRequestFilter, MyRequestRow } from '../my-requests/my-requests.types';
import type { AccessRequestHistoryItemWire, DepartmentAccessRequestItemWire } from './request-history.dto';
import { RequestHistoryRefusedError } from './request-history.errors';
import { awaitsHead, oversightScopeOf, parseFlagList } from './request-history.policy';

export type DepartmentHistoryQuery = Omit<MyRequestsQuery, 'involvement'> & { employeeId?: string };
export type OversightHistoryQuery = DepartmentHistoryQuery & { departmentId?: string; flag?: string };

/** The narrowing every history shares, read from the query: the states of the view, the type and the window of the moment sent. */
const narrowingOf = (query: DepartmentHistoryQuery): Omit<MyRequestFilter, 'scope' | 'skip' | 'take'> => ({
  states: statesOf(query.view, query.state === undefined ? undefined : (parseStateList(query.state) ?? [])),
  type: query.type,
  from: query.from === undefined ? undefined : new Date(query.from),
  to: query.to === undefined ? undefined : new Date(query.to),
  employeeId: query.employeeId,
});

/**
 * The history of requests as the people who oversee them read it, in every state, closed ones included (`FR-3.7`, `SoD-3`, `SoD-7`):
 * the head of a department reads every request sent from the department they head today; the IT Admin, the spending approver and
 * Finance read what their roles reach (`oversightScopeOf`). The rows are those of "my requests" with who sent it, the department and
 * whether the reserve was used; the page is read in a number of statements that does not grow with the rows. The detail, the time,
 * the people and the history of one request open to the same people (`canReadRequest`). The Super Admin reads none of it (`SoD-1`).
 */
@Injectable()
export class RequestHistoryService {
  constructor(
    private readonly lists: MyRequestsService,
    private readonly facts: MyRequestsFactsRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Throws RequestHistoryRefusedError (`OUT_OF_SCOPE` for a head of another department, `DEPARTMENT_NOT_FOUND`). */
  async departmentPage(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    query: DepartmentHistoryQuery,
  ): Promise<Page<DepartmentAccessRequestItemWire>> {
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);
    if (headed?.departmentId !== departmentId) {
      const exists = (await this.organizationReads.getDepartmentBrief(departmentId)) !== null;
      throw new RequestHistoryRefusedError(exists ? 'OUT_OF_SCOPE' : 'DEPARTMENT_NOT_FOUND');
    }
    // The department a request was sent from, as it was fixed then: a person who moved in brings none of their old requests.
    const { rows, total, lookups } = await this.lists.pageOf(
      { ...narrowingOf(query), scope: { kind: 'DEPARTMENT', departmentId } },
      query,
    );
    const items = await this.itemsOf(rows, lookups);

    return pageOf(
      items.map((item, index) => ({ ...item, awaitingMe: awaitsHead(rows[index], actor.employeeId) })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async oversightPage(
    actor: AuthenticatedPrincipal,
    query: OversightHistoryQuery,
  ): Promise<Page<AccessRequestHistoryItemWire>> {
    const flags = query.flag === undefined ? [] : (parseFlagList(query.flag) ?? []);
    const { rows, total, lookups } = await this.lists.pageOf(
      {
        ...narrowingOf(query),
        scope: oversightScopeOf(actor.roles),
        departmentId: query.departmentId,
        oneStep: flags.includes('ONE_STEP'),
        reserveUsed: flags.includes('RESERVE_USED'),
      },
      query,
    );

    return pageOf(await this.itemsOf(rows, lookups), total, query.page, query.pageSize);
  }

  /** The rows of the page with who sent each, its department, whether the reserve was used and the flag GH-3, read once for the page. */
  private async itemsOf(
    rows: readonly MyRequestRow[],
    lookups: MyRequestLookups,
  ): Promise<AccessRequestHistoryItemWire[]> {
    const ids = rows.map((row) => row.id);
    const departmentIds = [...new Set(rows.map((row) => row.departmentId))];
    const [departments, reserveUsed, manyPaidSoftware] = await Promise.all([
      departmentIds.length === 0 ? Promise.resolve([]) : this.organizationReads.getDepartmentBriefs(departmentIds),
      this.facts.reserveUsed(ids),
      this.facts.manyPaidSoftware(ids),
    ]);
    const departmentOf = new Map(departments.map((department) => [department.id, department]));

    return rows.map((row) => {
      // The hint of the withdrawal belongs to the sender's own list; nobody here withdraws.
      const summary: Partial<RequestSummaryCore> = toSummary(row, row.requesterEmployeeId, lookups);
      Reflect.deleteProperty(summary, 'canWithdraw');
      const requester = lookups.people.get(row.requesterEmployeeId);
      const department = departmentOf.get(row.departmentId);
      if (!requester || !department) throw new Error(`The request ${row.id} points at a missing person or department.`);

      return {
        ...(summary as Omit<RequestSummaryCore, 'canWithdraw'>),
        requester,
        department: { id: department.id, code: department.code, name: department.name },
        reserveUsed: reserveUsed.has(row.id),
        flags: { manyPaidSoftware: manyPaidSoftware.get(row.id) ?? null },
      };
    });
  }
}

import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { MyRequestSummaryWire } from './my-requests.dto';
import { MyRequestsFactsRepo } from './my-requests-facts.repo';
import { toSummary, type MyRequestLookups } from './my-requests.mapper';
import { parseStateList, statesOf } from './my-requests.policy';
import { MyRequestsRepo } from './my-requests.repo';
import type { MyRequestRow, MyRequestView } from './my-requests.types';

export interface MyRequestsQuery {
  page: number;
  pageSize: number;
  view?: MyRequestView;
  state?: string;
  type?: MyRequestRow['type'];
  from?: string;
  to?: string;
}

const idsOf = <T>(rows: readonly MyRequestRow[], pick: (row: MyRequestRow) => T | null): T[] => [
  ...new Set(rows.map(pick).filter((value): value is T => value !== null)),
];

/**
 * "My requests" (`US-16-01` AC-2): the requests the caller sent, never a draft and never one that somebody else sent, for the web and
 * the phone alike. Whose they are is one condition, the person who sent them; there is no way to name another person, and the person it
 * is for, the person who holds a step and the IT Admin read a request by its detail, not here. Everything about the page is read in a
 * number of statements that does not grow with the rows. Every signed-in account reads its own historical requests, regardless of its current role.
 */
@Injectable()
export class MyRequestsService {
  constructor(
    private readonly requests: MyRequestsRepo,
    private readonly facts: MyRequestsFactsRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  async list(actor: AuthenticatedPrincipal, query: MyRequestsQuery): Promise<Page<MyRequestSummaryWire>> {
    const { rows, total } = await this.requests.pageOf({
      requesterEmployeeId: actor.employeeId,
      states: statesOf(query.view, query.state === undefined ? undefined : (parseStateList(query.state) ?? [])),
      type: query.type,
      from: query.from === undefined ? undefined : new Date(query.from),
      to: query.to === undefined ? undefined : new Date(query.to),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const lookups = await this.lookupsFor(rows);

    return pageOf(
      rows.map((row) => toSummary(row, actor.employeeId, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** What the rows of the page need: the people and plans by name, the name of proposed software, the stage and the reasons. */
  private async lookupsFor(rows: readonly MyRequestRow[]): Promise<MyRequestLookups> {
    const withSpend = (state: MyRequestRow['state']): string[] =>
      idsOf(rows, (row) => (row.hasSpendStep && row.state === state ? row.id : null));
    const controlled = withSpend('WAITING_CONTROLLED');
    const queued = withSpend('AWAITING_SPEND_SUBMISSION');
    const rejected = withSpend('REJECTED');
    const personIds = idsOf(rows, (row) => row.beneficiaryEmployeeId).concat(
      idsOf(rows, (row) => (row.needStep.state === 'PENDING' ? row.needStep.assigneeEmployeeId : null)),
    );
    const planIds = idsOf(rows, (row) => row.planId);
    const [people, plans, softwareNames, checks, openSpendApproval, spendRefusals] = await Promise.all([
      personIds.length === 0 ? Promise.resolve([]) : this.organizationReads.getEmployees([...new Set(personIds)]),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.requests.proposalNames(idsOf(rows, (row) => (row.branch === 'NEW_SOFTWARE' ? row.id : null))),
      this.facts.latestChecks(queued),
      this.facts.withOpenSpendStep(controlled),
      this.facts.spendRefusals(rejected),
    ]);
    const needRefused = rows.filter((row) => row.state === 'REJECTED' && row.type !== 'GROUP_GRANT');
    const [needRefusals, assessmentRefusals] = await Promise.all([
      this.facts.needRefusals(needRefused.map((row) => row.needStepId)),
      this.facts.assessmentRefusals(idsOf(rows, (row) => (row.state === 'IT_REJECTED' ? row.id : null))),
    ]);

    return {
      people: new Map(
        people.map((p) => [p.id, { employeeId: p.id, employeeCode: p.employeeCode, fullName: p.fullName }]),
      ),
      plans: new Map(plans.map((plan) => [plan.planId, plan])),
      softwareNames,
      facts: {
        checks,
        openSpendApproval,
        spendRefusals,
        needRefusals,
        assessmentRefusals,
      },
    };
  }
}

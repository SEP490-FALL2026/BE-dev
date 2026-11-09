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
import type {
  MyRequestFilter,
  MyRequestInvolvement,
  MyRequestRow,
  MyRequestView,
  RequestScope,
} from './my-requests.types';

export interface MyRequestsQuery {
  page: number;
  pageSize: number;
  view?: MyRequestView;
  state?: string;
  type?: MyRequestRow['type'];
  from?: string;
  to?: string;
  involvement?: MyRequestInvolvement;
}

/** The scope each answer to "which of my requests" reads. */
const SCOPE_OF = { SENT: 'SENT_BY', FOR_ME: 'FOR', ALL: 'SENT_BY_OR_FOR' } as const satisfies Record<
  MyRequestInvolvement,
  RequestScope['kind']
>;

const idsOf = <T>(rows: readonly MyRequestRow[], pick: (row: MyRequestRow) => T | null): T[] => [
  ...new Set(rows.map(pick).filter((value): value is T => value !== null)),
];

/**
 * "My requests" (`US-16-01` AC-2): the requests the caller sent, and on asking those somebody else sent for them (one line of a request
 * for a group included), never a draft, for the web and the phone alike. There is no way to name another person: the history the people
 * who oversee requests read goes through `pageOf` with their own scope. Everything about the page is read in a
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
    const me = actor.employeeId;
    const involvement = query.involvement ?? 'SENT';
    const { rows, total, lookups } = await this.pageOf(
      {
        scope: { kind: SCOPE_OF[involvement], employeeId: me },
        states: statesOf(query.view, query.state === undefined ? undefined : (parseStateList(query.state) ?? [])),
        type: query.type,
        from: query.from === undefined ? undefined : new Date(query.from),
        to: query.to === undefined ? undefined : new Date(query.to),
      },
      query,
    );
    // The caller's own line, only in a request for a group that somebody else sent for them (the sender reads every line).
    const lines = await this.facts.linesOf(
      idsOf(rows, (row) => (row.type === 'GROUP_GRANT' && row.requesterEmployeeId !== me ? row.id : null)),
      me,
    );

    return pageOf(
      rows.map((row) => {
        const sent = row.requesterEmployeeId === me;
        const summary = toSummary(row, row.requesterEmployeeId, lookups);

        return {
          ...summary,
          involvement: sent ? ('SENT' as const) : ('FOR_ME' as const),
          myLine: lines.get(row.id) ?? null,
          // Only the person who sent a request withdraws it from here; a person it is for has nothing to withdraw (`SoD-4`).
          canWithdraw: sent && summary.canWithdraw,
        };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * One page of the requests of a scope with what its rows need from the other contexts, for "my requests" and for the history the
   * people who oversee requests read. The number of statements does not grow with the rows.
   */
  async pageOf(
    filter: Omit<MyRequestFilter, 'skip' | 'take'>,
    page: { page: number; pageSize: number },
  ): Promise<{ rows: MyRequestRow[]; total: number; lookups: MyRequestLookups }> {
    const { rows, total } = await this.requests.pageOf({
      ...filter,
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });

    return { rows, total, lookups: await this.lookupsFor(rows) };
  }

  /** What the rows of the page need: the people and plans by name, the name of proposed software, the stage and the reasons. */
  private async lookupsFor(rows: readonly MyRequestRow[]): Promise<MyRequestLookups> {
    const withSpend = (state: MyRequestRow['state']): string[] =>
      idsOf(rows, (row) => (row.hasSpendStep && row.state === state ? row.id : null));
    const controlled = withSpend('WAITING_CONTROLLED');
    const queued = withSpend('AWAITING_SPEND_SUBMISSION');
    const rejected = withSpend('REJECTED');
    const personIds = idsOf(rows, (row) => row.beneficiaryEmployeeId).concat(
      idsOf(rows, (row) => row.requesterEmployeeId),
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

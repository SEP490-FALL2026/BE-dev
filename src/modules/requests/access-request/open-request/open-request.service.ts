import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { GrantRequestOnItsWay, GrantRequestQuestion, OpenRequestOfBeneficiary } from '../../public/requests.types';
import type { AccessRequestState } from '../access-request.types';
import { OpenRequestRepo, type GrantRequestRow } from './open-request.repo';

type Stage = GrantRequestOnItsWay['stage'];

/** How far each state of a Request to grant has come; a Request that is carried out or done is approved, one in the queue of spend or sent back from it is at that step. */
const STAGE_OF: Partial<Record<AccessRequestState, Stage>> = {
  PENDING: 'BEFORE_SPEND',
  WAITING_CONTROLLED: 'BEFORE_SPEND',
  AWAITING_IT_ASSESSMENT: 'BEFORE_SPEND',
  AWAITING_SPEND_SUBMISSION: 'AT_SPEND',
  AWAITING_SPEND_DECISION: 'AT_SPEND',
  AWAITING_REQUESTER_REVISION: 'AT_SPEND',
  AWAITING_EXECUTION: 'APPROVED',
  EXECUTING: 'APPROVED',
  COMPLETED: 'APPROVED',
};
const FURTHEST: readonly Stage[] = ['BEFORE_SPEND', 'AT_SPEND', 'APPROVED'];

/**
 * The requests of a person that are still open, with the plan and who sent each (`US-03-04` AC-24). Nothing here changes a request:
 * closing one is the IT Admin's act (`DepartureCancellationService`). The names are read once for the page.
 */
@Injectable()
export class OpenRequestService {
  constructor(
    private readonly repo: OpenRequestRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** The ids of every request the person is a beneficiary of that is open, oldest first: what the system closes when they are gone. */
  idsOf(tx: DbTx, employeeId: string): Promise<string[]> {
    return this.repo.idsOf(tx, employeeId);
  }

  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
    filter: { departmentId?: string } = {},
  ): Promise<{ items: OpenRequestOfBeneficiary[]; total: number }> {
    const { items, total } = await this.repo.pageOf(employeeId, page, tx, filter);
    const planIds = [...new Set(items.flatMap((item) => (item.planId === null ? [] : [item.planId])))];
    const people = await this.organizationReads.getEmployees(
      [...new Set(items.map((item) => item.requesterEmployeeId))],
      tx,
    );
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds, tx);
    const beneficiary = await this.organizationReads.getEmployees([employeeId], tx);
    const left = beneficiary[0]?.status === 'TERMINATED';

    return {
      items: items.flatMap((item) => {
        const requester = people.find((person) => person.id === item.requesterEmployeeId);
        if (!requester) return [];
        const plan = plans.find((candidate) => candidate.planId === item.planId) ?? null;
        const group = item.type === 'GROUP_GRANT';

        return [
          {
            requestId: item.id,
            type: item.type,
            state: item.state,
            plan: plan && {
              planId: plan.planId,
              planName: plan.planName,
              applicationId: plan.applicationId,
              applicationName: plan.applicationName,
            },
            requester: { employeeId: requester.id, employeeCode: requester.employeeCode, fullName: requester.fullName },
            submittedAt: item.submittedAt,
            group,
            // A request for a group is listed only while this person's line is open, and the line is what the IT Admin closes.
            cancellable: left,
          },
        ];
      }),
      total,
    };
  }

  /**
   * For each question, the Request of that person for that application that has come furthest on its way to a grant (`US-13-05` AC-23), or null when
   * there is none. Two statements however many questions: the Requests of the people, then the plans they name.
   */
  async grantsOnItsWay(
    questions: readonly GrantRequestQuestion[],
    tx?: DbTx,
  ): Promise<(GrantRequestOnItsWay | null)[]> {
    if (questions.length === 0) return [];
    const earliest = questions.reduce((day, question) => (question.since < day ? question.since : day), '9999-12-31');
    const rows = await this.repo.grantsOf([...new Set(questions.map((question) => question.employeeId))], earliest, tx);
    const planIds = [...new Set(rows.flatMap((row) => (row.planId === null ? [] : [row.planId])))];
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds, tx);
    const applicationOf = new Map(plans.map((plan) => [plan.planId, plan.applicationId]));
    const organization = await this.organizationReads.getOrganization(tx);
    const timeZone = organization?.timeZone ?? 'UTC';

    return questions.map((question) => {
      const answers = rows
        .filter((row) => row.planId !== null && applicationOf.get(row.planId) === question.applicationId)
        .filter((row) => row.beneficiaryEmployeeIds.includes(question.employeeId))
        .flatMap((row) => this.wayOf(row, question, timeZone));
      const furthest = Math.max(...answers.map((answer) => FURTHEST.indexOf(answer.stage)));

      return answers.find((answer) => FURTHEST.indexOf(answer.stage) === furthest) ?? null;
    });
  }

  private wayOf(row: GrantRequestRow, question: GrantRequestQuestion, timeZone: string): GrantRequestOnItsWay[] {
    const stage = STAGE_OF[row.state];
    if (stage === undefined) return [];
    // A Request that is done counts only for the right it granted after the case was concluded.
    if (row.state === 'COMPLETED' && (row.grantedOn === null || row.grantedOn < question.since)) return [];

    return [
      {
        requestId: row.id,
        stage,
        reachedSpendOn:
          stage === 'AT_SPEND' && row.spendQueuedAt !== null ? businessDateAt(row.spendQueuedAt, timeZone) : null,
      },
    ];
  }
}

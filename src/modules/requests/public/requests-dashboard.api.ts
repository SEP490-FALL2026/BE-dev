import { Injectable } from '@nestjs/common';
import { fromDateColumn, businessDateAt, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { statesOf } from '../my-requests/my-requests.policy';
import { MyRequestsFactsRepo } from '../my-requests/my-requests-facts.repo';
import { MyRequestsRepo } from '../my-requests/my-requests.repo';
import { NeedDecisionQueueRepo } from '../need-decision-queue/need-decision-queue.repo';
import type { TransferGraceRequestFacts } from './requests-dashboard.types';

/** Counts the caller's own requests for every signed-in account, using the same scope as the list. */
@Injectable()
export class RequestsDashboardApi {
  constructor(
    private readonly myRequests: MyRequestsRepo,
    private readonly needQueue: NeedDecisionQueueRepo,
    private readonly facts: MyRequestsFactsRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The open requests this person sent, whatever their role, including requests sent before their current role. */
  async openRequestsSentBy(employeeId: string): Promise<number> {
    return this.myRequests.countOf({
      scope: { kind: 'SENT_BY', employeeId },
      states: statesOf('open', undefined),
    });
  }

  /** The need steps that wait for the person now, as the need-decision queue counts them. */
  async needDecisionsHeldBy(employeeId: string): Promise<number> {
    return this.needQueue.countOpenOf(employeeId);
  }

  /**
   * The requests sent from `from` to `to` (both days included) by a person in the grace of their transfer, with the day each was sent and granted (SPEC P22,
   * R5 E7). `departmentIds` narrows to the departments they were sent from (the scope of an IT Admin); absent, the whole company.
   */
  async transferGraceRequests(input: {
    from: BusinessDate;
    to: BusinessDate;
    departmentIds?: readonly string[] | undefined;
  }): Promise<TransferGraceRequestFacts[]> {
    const zone = (await this.organizationReads.getOrganization())?.timeZone ?? 'UTC';
    const next = new Date(`${input.to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const rows = await this.facts.sentInTransferGrace({
      from: instantAtWallClock({ date: input.from, msOfDay: 0 }, zone),
      to: instantAtWallClock({ date: next.toISOString().slice(0, 10), msOfDay: 0 }, zone),
      departmentIds: input.departmentIds,
    });

    return rows.map((row) => ({
      requesterEmployeeId: row.requesterEmployeeId,
      submittedOn: businessDateAt(row.submittedAt, zone),
      grantedOn: row.grantedOn ? fromDateColumn(row.grantedOn) : null,
    }));
  }
}

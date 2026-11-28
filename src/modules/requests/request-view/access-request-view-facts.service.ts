import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { LatestReply } from '../request-reply/request-reply.types';
import { RequestReplyRepo } from '../request-reply/request-reply.repo';

/** Batch-loads cross-module facts and latest resubmission reply needed to render one access request detail view. */
@Injectable()
export class AccessRequestViewFactsService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly assessments: AssessmentReadRepo,
    private readonly replies: RequestReplyRepo,
  ) {}

  async load(record: AccessRequestRecord, peopleIds: string[]) {
    const [people, plans, department, costCenters, proposal, rawReply] = await Promise.all([
      this.organizationReads.getEmployees(peopleIds),
      record.planId === null ? Promise.resolve([]) : this.catalog.getPlanSummaries([record.planId]),
      this.organizationReads.getDepartmentBrief(record.departmentId),
      record.costCenterId === null
        ? Promise.resolve([])
        : this.organizationReads.costCentersByIds([record.costCenterId]),
      record.branch === 'NEW_SOFTWARE' ? this.assessments.findProposal(record.id) : Promise.resolve(null),
      this.replies.latestOf(record.id),
    ]);

    let latestReply: LatestReply | null = null;
    if (rawReply) {
      const author =
        people.find((employee) => employee.id === rawReply.authorEmployeeId) ??
        (await this.organizationReads.getEmployees([rawReply.authorEmployeeId]))[0];
      if (!author) {
        throw new Error(`The reply author ${rawReply.authorEmployeeId} of the request ${record.id} does not exist.`);
      }
      latestReply = {
        kind: rawReply.kind,
        note: rawReply.note,
        author: { id: author.id, name: author.fullName },
        createdAt: rawReply.createdAt,
      };
    }

    return { people, plans, department, costCenters, proposal, latestReply };
  }
}

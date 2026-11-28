import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
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
    const [people, plans, department, costCenters, proposal, latestReply] = await Promise.all([
      this.organizationReads.getEmployees(peopleIds),
      record.planId === null ? Promise.resolve([]) : this.catalog.getPlanSummaries([record.planId]),
      this.organizationReads.getDepartmentBrief(record.departmentId),
      record.costCenterId === null
        ? Promise.resolve([])
        : this.organizationReads.costCentersByIds([record.costCenterId]),
      record.branch === 'NEW_SOFTWARE' ? this.assessments.findProposal(record.id) : Promise.resolve(null),
      this.replies.latestOf(record.id),
    ]);

    return { people, plans, department, costCenters, proposal, latestReply };
  }
}

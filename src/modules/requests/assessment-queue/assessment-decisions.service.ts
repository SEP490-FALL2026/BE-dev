import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssessmentDecisionItemWire } from './assessment-decisions.dto';
import { decisionItemOf } from './assessment-decisions.mapper';
import { AssessmentDecisionsRepo, type AssessmentDecisionRow } from './assessment-decisions.repo';
import type { QueueLookups } from './assessment-queue.mapper';
import { AssessmentQueueReachService } from './assessment-queue-reach.service';

/**
 * The assessments an IT Admin (or another IT Admin of the scope) has decided, in the departments the caller reads, the newest decision first. It only
 * reads: an assessment is read, completed or refused by the routes of the request.
 */
@Injectable()
export class AssessmentDecisionsService {
  constructor(
    private readonly decisions: AssessmentDecisionsRepo,
    private readonly reach: AssessmentQueueReachService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; departmentId?: string },
  ): Promise<Page<AssessmentDecisionItemWire>> {
    const departmentIds = await this.reach.departmentsOf(actor, query.departmentId);
    if (departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.decisions.page(departmentIds, (query.page - 1) * query.pageSize, query.pageSize);
    const lookups = await this.lookupsFor(rows);

    return pageOf(
      rows.map((row) => decisionItemOf(row, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async lookupsFor(rows: readonly AssessmentDecisionRow[]): Promise<QueueLookups> {
    if (rows.length === 0) return { people: new Map(), departments: new Map() };
    const personIds = [...new Set(rows.flatMap((row) => [row.requesterEmployeeId, row.decidedByEmployeeId]))];
    const people = await this.organizationReads.getEmployees(personIds);
    const departments = await this.organizationReads.getDepartmentBriefs([
      ...new Set(rows.map((row) => row.departmentId)),
    ]);

    return {
      people: new Map(people.map((person) => [person.id, person])),
      departments: new Map(departments.map((department) => [department.id, department])),
    };
  }
}

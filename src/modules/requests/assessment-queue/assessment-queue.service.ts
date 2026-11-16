import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssessmentQueueDepartmentWire, AssessmentQueueItemWire } from './assessment-queue.dto';
import { queueItemOf, type QueueLookups } from './assessment-queue.mapper';
import { AssessmentQueueRepo, type AssessmentQueueRow } from './assessment-queue.repo';
import { AssessmentQueueReachService } from './assessment-queue-reach.service';

/**
 * What waits for the IT Admin to assess: the proposals of new software whose assessment step has come to IT, in the departments the
 * IT Admin works (the ones that name them in charge, and the ones nobody usable is in charge of), the oldest first. It only reads: the
 * assessment itself is read, saved, completed or refused by the routes of the request, with the rules they already have.
 */
@Injectable()
export class AssessmentQueueService {
  constructor(
    private readonly queue: AssessmentQueueRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly reach: AssessmentQueueReachService,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; departmentId?: string },
  ): Promise<Page<AssessmentQueueItemWire>> {
    const departmentIds = await this.reach.departmentsOf(actor, query.departmentId);
    if (departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.queue.page(
      actor.employeeId,
      departmentIds,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const lookups = await this.lookupsFor(rows);

    return pageOf(
      rows.map((row) => queueItemOf(row, actor.employeeId, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** How many proposals wait in each department of the scope of the caller, the departments with the most first: what a screen shows beside the filter by department. */
  async departments(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<AssessmentQueueDepartmentWire>> {
    const departmentIds = await this.reach.departmentsOf(actor);
    if (departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.queue.departmentCounts(
      departmentIds,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const briefs = await this.organizationReads.getDepartmentBriefs(rows.map((row) => row.departmentId));
    const names = new Map(briefs.map((brief) => [brief.id, brief.name]));

    return pageOf(
      rows.map((row) => {
        const name = names.get(row.departmentId);
        if (name === undefined)
          throw new Error(`The department ${row.departmentId} of a waiting assessment does not exist.`);

        return { department: { id: row.departmentId, name }, waiting: row.waiting };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Which applications the short proposals of the page name are internal software: one read for the page, none when no proposal names an application. */
  private async internalApplicationsOf(rows: readonly AssessmentQueueRow[]): Promise<Set<string>> {
    const named = [...new Set(rows.flatMap((row) => (row.existingApplicationId ? [row.existingApplicationId] : [])))];
    if (named.length === 0) return new Set();

    return new Set(
      (await this.catalog.getCollectorApplications(named))
        .filter((application) => application.kind === 'INTERNAL')
        .map((application) => application.id),
    );
  }

  private async lookupsFor(rows: readonly AssessmentQueueRow[]): Promise<QueueLookups> {
    if (rows.length === 0) return { people: new Map(), departments: new Map(), internalApplicationIds: new Set() };
    const personIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.assigneeEmployeeId === null
            ? [row.requesterEmployeeId]
            : [row.requesterEmployeeId, row.assigneeEmployeeId],
        ),
      ),
    ];
    const departmentIds = [...new Set(rows.map((row) => row.departmentId))];
    const people = await this.organizationReads.getEmployees(personIds);
    const departments = await this.organizationReads.getDepartmentBriefs(departmentIds);

    return {
      people: new Map(people.map((person) => [person.id, person])),
      departments: new Map(departments.map((department) => [department.id, department])),
      internalApplicationIds: await this.internalApplicationsOf(rows),
    };
  }
}

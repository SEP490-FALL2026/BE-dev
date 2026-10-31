import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { AssessmentQueueItemWire } from './assessment-queue.dto';
import { queueItemOf, type QueueLookups } from './assessment-queue.mapper';
import { AssessmentQueueRepo, type AssessmentQueueRow } from './assessment-queue.repo';

/**
 * What waits for the IT Admin to assess: the proposals of new software whose assessment step has come to IT, in the departments the
 * IT Admin works (the ones that name them in charge, and the ones nobody usable is in charge of), the oldest first. It only reads: the
 * assessment itself is read, saved, completed or refused by the routes of the request, with the rules they already have.
 */
@Injectable()
export class AssessmentQueueService {
  constructor(
    private readonly queue: AssessmentQueueRepo,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<AssessmentQueueItemWire>> {
    const departmentIds = await this.organization.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
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

  private async lookupsFor(rows: readonly AssessmentQueueRow[]): Promise<QueueLookups> {
    if (rows.length === 0) return { people: new Map(), departments: new Map() };
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
    const people = await this.organization.getEmployees(personIds);
    const departments = await this.organization.getDepartmentBriefs(departmentIds);

    return {
      people: new Map(people.map((person) => [person.id, person])),
      departments: new Map(departments.map((department) => [department.id, department])),
    };
  }
}

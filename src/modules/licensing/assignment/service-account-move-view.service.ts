import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../../organization/organization.service';
import { AssignmentRepo } from './assignment.repo';
import type { ServiceAccountMoveWire } from './service-account.dto';
import { ServiceAccountMoveRepo, type MoveRecord, type MoveStatus } from './service-account-move.repo';

/**
 * Reads the moves of service accounts (`US-03-08` AC-10): the IT Admin sees every proposal; the head of a receiving department, and
 * the fallback approver for a department that has no head, see only the proposals into it that wait for them. The names of a page
 * are read once for the whole page, so the number of statements does not grow with its size.
 */
@Injectable()
export class ServiceAccountMoveViewService {
  constructor(
    private readonly moves: ServiceAccountMoveRepo,
    private readonly assignments: AssignmentRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly identity: IdentityAccessService,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    query: { status?: MoveStatus; page: number; pageSize: number },
  ): Promise<Page<ServiceAccountMoveWire>> {
    const isItAdmin = actor.roles.includes('IT_ADMIN');
    const toDepartmentIds = isItAdmin ? null : await this.departmentsWaitingOn(actor);
    if (toDepartmentIds !== null && toDepartmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.moves.page({
      // Someone who is not an IT Admin sees only what waits for them to confirm.
      ...(isItAdmin ? (query.status ? { status: query.status } : {}) : { status: 'PENDING' as const }),
      toDepartmentIds,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.wireOf(items), total, query.page, query.pageSize);
  }

  /** The moves with the names a person reads, in the order they were given. */
  async wireOf(records: readonly MoveRecord[]): Promise<ServiceAccountMoveWire[]> {
    const assignments = new Map(
      (await this.assignments.findByIds([...new Set(records.map((record) => record.assignmentId))])).map(
        (assignment) => [assignment.id, assignment],
      ),
    );
    const [people, departments, plans] = await Promise.all([
      this.organization.getEmployees([
        ...new Set(
          records.flatMap((record) => {
            const held = assignments.get(record.assignmentId);

            return held ? [record.newResponsibleEmployeeId, held.employeeId] : [record.newResponsibleEmployeeId];
          }),
        ),
      ]),
      this.organization.getDepartmentBriefs([
        ...new Set(records.flatMap((record) => [record.fromDepartmentId, record.toDepartmentId])),
      ]),
      this.catalog.getPlanSummaries([...new Set([...assignments.values()].map((assignment) => assignment.planId))]),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const departmentById = new Map(departments.map((department) => [department.id, department]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));
    const employeeBrief = (id: string) => {
      const person = personById.get(id);

      return { employeeId: id, employeeCode: person?.employeeCode ?? '', fullName: person?.fullName ?? '' };
    };
    const departmentBrief = (id: string) => {
      const department = departmentById.get(id);

      return { id, code: department?.code ?? '', name: department?.name ?? '' };
    };

    return records.map((record) => {
      const assignment = assignments.get(record.assignmentId);
      const plan = assignment ? planById.get(assignment.planId) : undefined;

      return {
        id: record.id,
        status: record.status,
        assignmentId: record.assignmentId,
        accountIdentifier: assignment?.accountIdentifier ?? '',
        plan: {
          planId: assignment?.planId ?? '',
          planName: plan?.planName ?? '',
          applicationName: plan?.applicationName ?? '',
        },
        currentResponsible: employeeBrief(assignment?.employeeId ?? ''),
        fromDepartment: departmentBrief(record.fromDepartmentId),
        toDepartment: departmentBrief(record.toDepartmentId),
        newResponsible: employeeBrief(record.newResponsibleEmployeeId),
        effectiveFrom: record.effectiveFrom,
        expectedEndDate: record.expectedEndDate,
        proposedByAppUserId: record.proposedByAppUserId,
        proposedAt: record.proposedAt.toISOString(),
        confirmation:
          record.confirmedByEmployeeId && record.confirmedByRole && record.confirmedAt
            ? {
                confirmedByEmployeeId: record.confirmedByEmployeeId,
                role: record.confirmedByRole,
                confirmedAt: record.confirmedAt.toISOString(),
              }
            : null,
        cancellation:
          record.cancelledByAppUserId && record.cancelledAt && record.cancelledReason !== null
            ? {
                cancelledByAppUserId: record.cancelledByAppUserId,
                cancelledAt: record.cancelledAt.toISOString(),
                reason: record.cancelledReason,
              }
            : null,
        resultingAssignmentId: record.resultingAssignmentId,
      };
    });
  }

  /**
   * The departments with a proposal that waits for this person: the one they head today, and, when they hold the fallback
   * approver, every department with a proposal that has no head today.
   */
  private async departmentsWaitingOn(actor: AuthenticatedPrincipal): Promise<string[]> {
    const today = await this.organization.businessToday();
    const ids = new Set<string>();
    const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
    if (headed) ids.add(headed.departmentId);
    const holders = await this.identity.getApprovalRoleHolders();
    if (holders.fallbackApproverEmployeeId === actor.employeeId) {
      const waiting = await this.moves.departmentsWithPending();
      const heads = await this.organization.getDepartmentHeads(waiting, today);
      for (const departmentId of waiting) if (!heads.has(departmentId)) ids.add(departmentId);
    }

    return [...ids];
  }
}

import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../licensing.errors';
import type { AssignmentKind, AssignmentSource } from '../licensing.types';
import { RevocationReadService } from '../provisioning/revocation-read.service';
import { effectiveFromLabel } from './assignment.policy';
import { AssignmentDepartmentRepo } from './assignment-department.repo';

export interface ToolInUse {
  assignmentId: string;
  employeeCode: string;
  fullName: string;
  holderStatus: string;
  kind: AssignmentKind;
  source: AssignmentSource;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  effectiveFrom: BusinessDate;
  effectiveFromLabel: string | null;
  /** The seat is on its way out: it is held until the end of a paid period (a K1 seat whose renewal was cancelled, `US-07-05` AC-19). */
  terminating: boolean;
  terminatingUntil: BusinessDate | null;
}

export interface ToolsSummaryLine {
  applicationId: string;
  applicationName: string;
  planId: string;
  planName: string;
  seats: number;
}

/**
 * The tools a department uses (`US-03-06` AC-13): an aggregate read of the seats on the subscriptions the department owns (whoever
 * holds them, `QĐ-89a`) and the service accounts it owns, never a list that is typed in or edited, and not a recommendation; one page
 * by start date, with the counts of all (`LD-09`). A seat that ends at the end of a paid period says so (`terminating`): that is a K1
 * seat whose renewal was cancelled, found by the one read of the revocations that says so, and never a seat that merely has an end
 * day (a renewed seat and a service account passed to another person end on a day and go on in the next record). The IT Admin
 * reads any department; a department head reads the one they head (AC-17, `SoD-2`). The account identifier of a seat is not shown
 * here: a head sees which tool each person has, not how they sign in. Keys of K4 purchases do not join the list: a key has no holder
 * to group by yet (`US-04-12` AC-5 to AC-8 are blocked), and none is invented.
 */
@Injectable()
export class DepartmentToolsService {
  constructor(
    private readonly repo: AssignmentDepartmentRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly revocations: RevocationReadService,
  ) {}

  /** Throws ToolsDepartmentNotFoundError and ToolsDepartmentOutOfScopeError. `summary` counts every seat, `items` is one page. */
  async toolsInUse(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    query: { page: number; pageSize: number },
  ): Promise<{ asOf: BusinessDate; summary: ToolsSummaryLine[]; page: Page<ToolInUse> }> {
    const today = await this.organization.businessToday();
    const memberIds = await this.organization.getDepartmentMemberIds(departmentId, today);
    if (!memberIds) throw new ToolsDepartmentNotFoundError();
    await this.assertMayRead(principal, departmentId, today);

    const start = (query.page - 1) * query.pageSize;
    const {
      items: assignments,
      total,
      byPlan,
    } = await this.repo.toolsOfDepartment({ memberIds, departmentId }, today, start, query.pageSize);
    // Only the plans of the seats and the people of this page are named: the summary counts, the page names.
    const plans = new Map(
      (
        await this.catalog.getPlanSummaries([
          ...new Set([...assignments.map((a) => a.planId), ...byPlan.map((p) => p.planId)]),
        ])
      ).map((plan) => [plan.planId, plan]),
    );
    const people = new Map(
      (await this.organization.getEmployees([...new Set(assignments.map((assignment) => assignment.employeeId))])).map(
        (person) => [person.id, person],
      ),
    );
    // A seat is on its way out only when its renewal was cancelled and its access runs on to the end of the paid period (AC-19): the
    // read of the revocations says which of these people hold one, and the seats of this page are picked from it.
    const terminating = new Map(
      (await this.revocations.terminatingAccess([...new Set(assignments.map((a) => a.employeeId))])).map((access) => [
        access.assignmentId,
        access.accessUntil,
      ]),
    );

    const items = assignments.flatMap((assignment): ToolInUse[] => {
      const plan = plans.get(assignment.planId);
      const person = people.get(assignment.employeeId);
      if (!plan || !person) return [];

      return [
        {
          assignmentId: assignment.id,
          employeeCode: person.employeeCode,
          fullName: person.fullName,
          holderStatus: person.status,
          kind: assignment.kind,
          source: assignment.source,
          application: { id: plan.applicationId, name: plan.applicationName },
          plan: { id: plan.planId, name: plan.planName },
          effectiveFrom: assignment.effectiveFrom,
          effectiveFromLabel: effectiveFromLabel(assignment.effectiveFromBasis, assignment.effectiveFrom),
          terminating: terminating.has(assignment.id),
          terminatingUntil: terminating.get(assignment.id) ?? null,
        },
      ];
    });
    const summary = byPlan
      .flatMap((group): ToolsSummaryLine[] => {
        const plan = plans.get(group.planId);

        return plan
          ? [
              {
                applicationId: plan.applicationId,
                applicationName: plan.applicationName,
                planId: plan.planId,
                planName: plan.planName,
                seats: group.count,
              },
            ]
          : [];
      })
      .sort((a, b) => a.applicationName.localeCompare(b.applicationName) || a.planName.localeCompare(b.planName));

    return { asOf: today, summary, page: pageOf(items, total, query.page, query.pageSize) };
  }

  /** The IT Admin sees any department; a department head sees only the one they head today. */
  private async assertMayRead(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    today: BusinessDate,
  ): Promise<void> {
    if (principal.roles.includes('IT_ADMIN')) return;
    const headed = await this.organization.getHeadedDepartment(principal.employeeId, today);
    if (headed?.departmentId !== departmentId) throw new ToolsDepartmentOutOfScopeError();
  }
}

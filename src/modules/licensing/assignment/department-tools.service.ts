import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../licensing.errors';
import type { AssignmentKind, AssignmentSource } from '../licensing.types';
import { effectiveFromLabel } from './assignment.policy';
import { AssignmentRepo } from './assignment.repo';

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
}

export interface ToolsSummaryLine {
  applicationId: string;
  applicationName: string;
  planId: string;
  planName: string;
  seats: number;
}

/**
 * The tools a department uses (`US-03-06` AC-13): an aggregate read of the seats its people hold today, never a list that
 * is typed in or edited. The IT Admin reads any department; a department head reads the one they head (AC-17, `SoD-2`).
 * The account identifier of a seat is not shown here: a head sees which tool each person has, not how they sign in.
 * Licence keys (K4) join the list when the key vault exists.
 */
@Injectable()
export class DepartmentToolsService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
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

    const assignments = await this.repo.openOf(memberIds, today);
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(assignments.map((assignment) => assignment.planId))])).map(
        (plan) => [plan.planId, plan],
      ),
    );
    const people = new Map(
      (await this.organization.getEmployees([...new Set(assignments.map((assignment) => assignment.employeeId))])).map(
        (person) => [person.id, person],
      ),
    );

    const items = assignments
      .flatMap((assignment): ToolInUse[] => {
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
          },
        ];
      })
      .sort(
        (a, b) =>
          a.employeeCode.localeCompare(b.employeeCode) ||
          a.application.name.localeCompare(b.application.name) ||
          a.assignmentId.localeCompare(b.assignmentId),
      );

    const lines = new Map<string, ToolsSummaryLine>();
    for (const item of items) {
      const line = lines.get(item.plan.id) ?? {
        applicationId: item.application.id,
        applicationName: item.application.name,
        planId: item.plan.id,
        planName: item.plan.name,
        seats: 0,
      };
      line.seats += 1;
      lines.set(item.plan.id, line);
    }
    const summary = [...lines.values()].sort(
      (a, b) => a.applicationName.localeCompare(b.applicationName) || a.planName.localeCompare(b.planName),
    );
    const start = (query.page - 1) * query.pageSize;

    return {
      asOf: today,
      summary,
      page: pageOf(items.slice(start, start + query.pageSize), items.length, query.page, query.pageSize),
    };
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

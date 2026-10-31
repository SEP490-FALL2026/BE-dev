import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { AssignmentListFilter, AssignmentSummaryView } from '../public/licensing.types';
import { AssignmentRepo } from './assignment.repo';
import { toAssignmentView } from './assignment.policy';

/**
 * The assignments an IT Admin browses (`US-02-05`): a page cut and counted in one snapshot, each row with the
 * person, the plan and the Cost Center it names, read once for the whole page instead of one at a time. Three reads of
 * other capabilities at most, whatever the page size.
 */
@Injectable()
export class AssignmentListService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** One page by start date then id, the start shown as the grant date only when it is the real one. */
  async list(
    filter: Omit<AssignmentListFilter, 'skip' | 'take'> & { page: number; pageSize: number },
  ): Promise<Page<AssignmentSummaryView>> {
    const { page, pageSize, ...rest } = filter;
    const { items, total } = await this.repo.page({ ...rest, skip: (page - 1) * pageSize, take: pageSize });
    const [people, plans, costCenters] = await Promise.all([
      this.organization.getEmployees([...new Set(items.map((item) => item.employeeId))]),
      this.catalog.getPlanSummaries([...new Set(items.map((item) => item.planId))]),
      this.organization.costCentersByIds([
        ...new Set(items.flatMap((item) => (item.costCenterId ? [item.costCenterId] : []))),
      ]),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));
    const centerById = new Map(costCenters.map((center) => [center.id, center]));

    return pageOf(
      items.flatMap((item): AssignmentSummaryView[] => {
        const person = personById.get(item.employeeId);
        const plan = planById.get(item.planId);
        if (!person || !plan) return [];
        const center = item.costCenterId ? centerById.get(item.costCenterId) : undefined;

        return [
          {
            ...toAssignmentView(item),
            employee: { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
            plan: { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName },
            costCenter: center ? { id: center.id, code: center.code, name: center.name } : null,
          },
        ];
      }),
      total,
      page,
      pageSize,
    );
  }
}

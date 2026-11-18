import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssignmentListFilter, AssignmentSummaryView } from '../public/licensing.types';
import { AssignmentRepo } from './assignment.repo';
import { AssignmentRevocationRepo } from './assignment-revocation.repo';
import { revocationOf, toAssignmentView } from './assignment.policy';

/**
 * The assignments an IT Admin browses (`US-02-05`, `QĐ-111n`, `QĐ-111p`): a page cut and counted in one snapshot, each row with the person, the plan
 * with the logo of its application, the Cost Center it names and the revocation task that is open for it, read once for the whole page instead of one
 * at a time. A fixed number of reads, whatever the page size.
 */
@Injectable()
export class AssignmentListService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly revocations: AssignmentRevocationRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  /**
   * One page by start date then id, the start shown as the grant date only when it is the real one. `activeOnly` keeps the rights in force today:
   * not ended, not failed, not cancelled, one that begins later included (what the seats of a subscription count).
   */
  async list(
    filter: Omit<AssignmentListFilter, 'skip' | 'take' | 'holdingOn'> & {
      activeOnly?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<AssignmentSummaryView>> {
    const { page, pageSize, activeOnly, ...rest } = filter;
    const today = await this.organizationReads.businessToday();
    const { items, total } = await this.repo.page({
      ...rest,
      ...(activeOnly ? { holdingOn: today } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const [people, plans, costCenters, open] = await Promise.all([
      this.organizationReads.getEmployees([...new Set(items.map((item) => item.employeeId))]),
      this.catalog.getPlanSummariesWithLogo([...new Set(items.map((item) => item.planId))]),
      this.organizationReads.costCentersByIds([
        ...new Set(items.flatMap((item) => (item.costCenterId ? [item.costCenterId] : []))),
      ]),
      this.revocations.openOf(items.map((item) => item.id)),
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
        const task = open.get(item.id);

        return [
          {
            ...toAssignmentView(item),
            employee: { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
            plan: {
              planId: plan.planId,
              planName: plan.planName,
              applicationName: plan.applicationName,
              logoUrl: plan.applicationLogoUrl,
            },
            costCenter: center ? { id: center.id, code: center.code, name: center.name } : null,
            revocation: task ? revocationOf(task, today) : null,
          },
        ];
      }),
      total,
      page,
      pageSize,
    );
  }
}

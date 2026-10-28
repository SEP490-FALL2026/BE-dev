import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import type { DepartmentUseReader, UseGroup } from '../../organization/organization-use.types';
import { ProvisioningDepartmentUseRepo } from './provisioning-department-use.repo';

/**
 * What keeps a department in use that this module holds (`QĐ-90e`, F15): the provisioning tasks that are not over and whose assignment
 * belongs to the department. The Requests and the personnel events that are not over are told by their own modules to the same group.
 * It hands itself to the organization when the module starts, so the organization never imports licensing. A fixed number of
 * statements however many tasks there are: the subscriptions the department owns, the page, the total and the names of the page.
 */
@Injectable()
export class DepartmentOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: ProvisioningDepartmentUseRepo,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerDepartmentUseReader(this);
  }

  /** A task is open or it is not: the day does not change which. */
  async read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    const subscriptionIds = await this.catalog.getSubscriptionIdsOwnedBy(departmentId, tx);
    const { items, total } = await this.repo.openOfDepartment(departmentId, subscriptionIds, limit, tx);
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(items.map((item) => item.planId))])).map((plan) => [
        plan.planId,
        `${plan.applicationName} / ${plan.planName}`,
      ]),
    );

    return {
      total,
      items: items.map((item) => ({
        kind: 'PROVISIONING_TASK',
        id: item.taskId,
        label: plans.get(item.planId) ?? null,
      })),
    };
  }
}

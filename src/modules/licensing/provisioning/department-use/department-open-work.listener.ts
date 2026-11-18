import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../../organization/public/organization.extension-points';
import type { UseGroup } from '../../../organization/public/organization-use.types';
import { ProvisioningDepartmentUseRepo } from './provisioning-department-use.repo';

/**
 * What keeps a department in use that this module holds (`QĐ-90e`): the provisioning tasks that are not over and whose assignment
 * belongs to the department. The Requests and the personnel events that are not over are told by their own modules to the same group.
 * It hands itself to the organization when the module starts, so the organization never imports licensing. A fixed number of
 * statements however many tasks there are: the subscriptions the department owns, the page, the total and the names of the page.
 */
@Injectable()
export class DepartmentOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: ProvisioningDepartmentUseRepo,
    private readonly catalog: CatalogApi,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('licensing.provisioning-open-work', this);
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

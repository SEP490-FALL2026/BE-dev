import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { pendingNoticeOwed, plansLeftWithoutAdmin } from './it-handover.policy';
import type { HandoverSource } from './it-handover.types';

/**
 * The milestone of a departure (the block of the access) or of a transfer (the day it takes effect) is here, in the transaction that opens it
 * (`QĐ-110j`, `R-26`, `QĐ-110k`): a departure that takes away the last working vendor admin of a plan tells the active subscription IT Admins
 * of that plan (or the usable Super Admin fallback); when the departing or transferred IT Admin still answers for a subscription or an
 * application, the usable Super Admin is told once for the file to hand them over. The file is never held back: a hand-over not made changes
 * nothing about its closing (`QĐ-110e`). The same milestone seen twice (a pass that runs again, another instance) tells nobody twice.
 */
@Injectable()
export class ItHandoverMilestoneService {
  constructor(
    private readonly catalog: CatalogResponsibilityApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Returns how many IT Admins were told (0 when nothing is left to hand over). */
  async reached(
    tx: DbTx,
    input: { organizationId: string; source: HandoverSource; employeeId: string; dueOn: BusinessDate },
  ): Promise<number> {
    // A departure puts the plans its person administers at the vendor out of reach; a transfer does not (the account of the person goes on).
    if (input.source.kind === 'OFFBOARDING_CASE') await this.vendorAdminsLost(tx, input);
    const left = (await this.catalog.countResponsibilitiesOf([input.employeeId], tx)).get(input.employeeId);
    const remaining = (left?.subscriptions ?? 0) + (left?.applications ?? 0);
    if (!pendingNoticeOwed({ milestoneReached: true, cancelled: false, remaining })) return 0;

    return this.notifier.itHandoverPending(tx, input);
  }

  /** Notifies active subscription IT Admins of each plan left without a working vendor admin, or falls back to the Super Admin. */
  private async vendorAdminsLost(
    tx: DbTx,
    input: { organizationId: string; source: HandoverSource; employeeId: string },
  ): Promise<void> {
    for (const role of plansLeftWithoutAdmin(await this.catalog.vendorAdminRolesOf(input.employeeId, tx))) {
      const responsibleItAdminEmployeeIds = await this.catalog.usableSubscriptionItAdminsOfPlan(role.planId, tx);
      await this.notifier.vendorAdminsGone(tx, {
        organizationId: input.organizationId,
        planId: role.planId,
        applicationId: role.applicationId,
        sourceId: input.source.id,
        responsibleItAdminEmployeeIds,
        leavingEmployeeId: input.employeeId,
      });
    }
  }
}

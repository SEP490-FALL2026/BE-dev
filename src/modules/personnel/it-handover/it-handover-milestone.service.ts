import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { pendingNoticeOwed } from './it-handover.policy';
import type { HandoverSource } from './it-handover.types';

/**
 * The milestone of a departure (the block of the access) or of a transfer (the day it takes effect) is here, in the transaction that opens it
 * (`QĐ-110j`, `R-26`, `QĐ-110k`): a departure notifies the responsible IT Admin of each workspace the person administers (or the usable
 * Super Admin fallback) with `WORKSPACE_ADMIN_NOT_WORKING`; when the departing or transferred IT Admin still answers for a subscription or an
 * application, the usable Super Admin is told once for the file to hand them over. The same milestone seen twice tells nobody twice.
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
    // A departure puts the workspaces its person administers at risk; a transfer does not (the account of the person goes on).
    if (input.source.kind === 'OFFBOARDING_CASE') await this.vendorAdminsLost(tx, input);
    const left = (await this.catalog.countResponsibilitiesOf([input.employeeId], tx)).get(input.employeeId);
    const remaining = (left?.subscriptions ?? 0) + (left?.applications ?? 0);
    if (!pendingNoticeOwed({ milestoneReached: true, cancelled: false, remaining })) return 0;

    return this.notifier.itHandoverPending(tx, input);
  }

  /** Notifies the responsible IT Admin (or usable Super Admin fallback) once per workspace administered by `input.employeeId`. */
  private async vendorAdminsLost(
    tx: DbTx,
    input: { organizationId: string; source: HandoverSource; employeeId: string },
  ): Promise<void> {
    const seen = new Set<string>();
    for (const role of await this.catalog.vendorAdminRolesOf(input.employeeId, tx)) {
      if (!role.workspaceId || seen.has(role.workspaceId)) continue;
      seen.add(role.workspaceId);
      await this.notifier.workspaceAdminNotWorking(tx, {
        organizationId: input.organizationId,
        workspaceId: role.workspaceId,
        employeeId: input.employeeId,
        responsibleItAdminEmployeeId: role.responsibleItAdminEmployeeId ?? null,
        workingAdminCount: role.othersWorking,
      });
    }
  }
}

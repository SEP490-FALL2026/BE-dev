import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { pendingNoticeOwed } from './it-handover.policy';
import type { HandoverSource } from './it-handover.types';

/**
 * The milestone of a departure (the block of the access) or of a transfer (the day it takes effect) is here, in the transaction that opens it
 * (`QĐ-110j`, `R-26`): when the IT Admin who leaves still answers for a subscription or an application, every IT Admin who works is told, once
 * each for the file, so the work lands in the common queue and is not left to a person who is leaving. The file is never held back: a hand-over
 * not made changes nothing about its closing (`QĐ-110e`). The same milestone seen twice (a pass that runs again, another instance) tells nobody twice.
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
    const left = (await this.catalog.countResponsibilitiesOf([input.employeeId], tx)).get(input.employeeId);
    const remaining = (left?.subscriptions ?? 0) + (left?.applications ?? 0);
    if (!pendingNoticeOwed({ milestoneReached: true, cancelled: false, remaining })) return 0;

    return this.notifier.itHandoverPending(tx, input);
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsService } from '../../notifications/notifications.service';
import { OrganizationService } from '../organization.service';
import type { OrganizationChange, OrganizationChangeListener } from '../organization.types';

/**
 * Hands the notices kept for a department while nobody headed it to the person whose head period STARTS (`T-11`, F67): in the
 * transaction of the assignment when the period begins today, and when the change `HEAD_PERIOD_START` is announced for a period
 * dated for a later day. A period that is still to begin hands over nothing, so a department named a head for next week still
 * keeps what happens in between; a period taken back by a later assignment before its day is never announced, and the head who
 * really begins first receives what was kept. Idempotent: a notice is handed over once, and a person who already has the notice
 * (the budget loop tells the same event key) is not told twice.
 *
 * Locks: the assignment holds the department `FOR UPDATE`, and a writer of a kept notice holds it `FOR SHARE` before it reads the head,
 * so the two cannot interleave. This listener takes no department lock of its own: the announcement of a later day runs with the head
 * period row locked, and taking the department after it would invert the order of the assignment (department, then periods).
 */
@Injectable()
export class HeldNoticeHandoverListener implements OrganizationChangeListener, OnModuleInit {
  constructor(
    private readonly organization: OrganizationService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.organization.registerChangeListener(this);
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'HEAD_PERIOD_START') return;
    const organization = await this.organization.getOrganization(tx);
    if (!organization) return;
    await this.notifications.deliverHeldToHead(tx, {
      organizationId: organization.id,
      departmentId: change.departmentId,
      headEmployeeId: change.headEmployeeId,
    });
  }
}

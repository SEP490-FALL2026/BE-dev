import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleChangeListeners } from '../../identity-access/public/identity-access.extension-points';
import type { ApprovalRoleChange } from '../../identity-access/public/identity-access.types';
import { OrganizationChangeListeners } from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { RenewalNotifier } from './subscription-renewal-notifier.service';
import { RenewalPartiesService } from './subscription-renewal-parties.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';

/**
 * The cases of renewal that wait for a decision begin to wait for a spending approver when the one who held the role stops: the role is
 * taken back with nobody after, or the person leaves the company (`D-S16`, `QĐ-93d`(1), spec › Quyết định phiên bản ngân sách và gia
 * hạn). The Super Admin is told once for each case and each change, in the transaction of the change; a change that is heard twice writes
 * one notice. It only reads cases and writes notices: it takes no lock of a case, so it cannot queue behind a decision.
 */
@Injectable()
export class RenewalSpendingApproverWaitListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ApprovalRoleChangeListeners, OrganizationChangeListeners] as const;

  constructor(
    private readonly renewals: SubscriptionRenewalRepo,
    private readonly parties: RenewalPartiesService,
    private readonly notifier: RenewalNotifier,
    private readonly roleChanges: ApprovalRoleChangeListeners,
    private readonly organizationChanges: OrganizationChangeListeners,
  ) {}

  onModuleInit(): void {
    this.roleChanges.add('licensing.renewal-spending-approver-wait', (tx, change) => this.onRoleChange(tx, change));
    this.organizationChanges.add('licensing.renewal-spending-approver-wait', (tx, change) =>
      this.onOrganizationChange(tx, change),
    );
  }

  /**
   * The role was taken back with nobody after it. A holder who had already left began the stretch when they left (and the notice was
   * written then), so only one who still works begins it here.
   */
  async onRoleChange(tx: DbTx, change: ApprovalRoleChange): Promise<void> {
    if (change.role !== 'SPENDING_APPROVER' || change.fromEmployeeId === null || change.toEmployeeId !== null) return;
    if (!(await this.parties.employeeWorks(change.fromEmployeeId, tx))) return;

    await this.tellWaiting(tx, `role:${change.id}`);
  }

  /** The person who holds the role left the company: the cases that wait for a decision wait for somebody else. */
  async onOrganizationChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'EMPLOYEE_LEFT') return;
    if (!(await this.parties.holdsApproverRole(change.employeeId, tx))) return;

    await this.tellWaiting(tx, `left:${change.id}`);
  }

  private async tellWaiting(tx: DbTx, source: string): Promise<void> {
    const waiting = await this.renewals.awaitingDecision(tx);
    if (waiting.length === 0) return;
    const superAdmin = await this.parties.superAdminOf(tx);
    for (const renewal of waiting) await this.notifier.waitingForSpendingApprover(tx, renewal, superAdmin, source);
  }
}

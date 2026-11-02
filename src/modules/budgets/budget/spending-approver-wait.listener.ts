import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApprovalRoleChangeListeners } from '../../identity-access/public/identity-access.extension-points';
import type { ApprovalRoleChange } from '../../identity-access/public/identity-access.types';
import { OrganizationChangeListeners } from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { BudgetFactsService } from './budget-facts.service';
import { BudgetNotifierService } from './budget-notifier.service';
import { VersionRepo } from './version.repo';

/**
 * The versions that were sent begin to wait for a spending approver when the one who held the role stops: the role is taken back
 * with nobody after, or the person leaves the company (`D-S16`, `QĐ-93d`(1), spec › Quyết định phiên bản ngân sách và gia hạn). The
 * Super Admin is told once for each version and each change, in the transaction of the change; a change that is heard twice writes one
 * notice. It only reads versions and writes notices: it takes no lock of a version, so it cannot queue behind a decision.
 */
@Injectable()
export class SpendingApproverWaitListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ApprovalRoleChangeListeners, OrganizationChangeListeners] as const;

  constructor(
    private readonly versions: VersionRepo,
    private readonly facts: BudgetFactsService,
    private readonly notifier: BudgetNotifierService,
    private readonly roleChanges: ApprovalRoleChangeListeners,
    private readonly organizationChanges: OrganizationChangeListeners,
  ) {}

  onModuleInit(): void {
    this.roleChanges.add('budgets.spending-approver-wait', (tx, change) => this.onRoleChange(tx, change));
    this.organizationChanges.add('budgets.spending-approver-wait', (tx, change) =>
      this.onOrganizationChange(tx, change),
    );
  }

  /**
   * The role was taken back with nobody after it. A holder who had already left began the stretch when they left (and the notice was
   * written then), so only one who still works begins it here.
   */
  async onRoleChange(tx: DbTx, change: ApprovalRoleChange): Promise<void> {
    if (change.role !== 'SPENDING_APPROVER' || change.fromEmployeeId === null || change.toEmployeeId !== null) return;
    if (!(await this.facts.employeeWorks(change.fromEmployeeId, tx))) return;

    await this.tellWaiting(tx, `role:${change.id}`);
  }

  /** The person who holds the role left the company: the versions that were sent wait for somebody else. */
  async onOrganizationChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'EMPLOYEE_LEFT') return;
    if (!(await this.facts.isSpendingApprover(change.employeeId, tx))) return;

    await this.tellWaiting(tx, `left:${change.id}`);
  }

  private async tellWaiting(tx: DbTx, source: string): Promise<void> {
    for (const version of await this.versions.sentOnes(tx)) await this.notifier.versionWaiting(tx, version, source);
  }
}

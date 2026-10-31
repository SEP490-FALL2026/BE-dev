import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  OrganizationChangeListeners,
  type OrganizationChangeListener,
} from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { BudgetSupportService } from '../budget/budget-support.service';
import { ProposalRepo } from '../budget/proposal.repo';

/**
 * A person became the head of a department (`HEAD_PERIOD_START`): the proposals Finance gave back that wait to be sent again or
 * withdrawn now fall to them, and they are told (row 54, `US-12-15` AC-1). It only reads and writes notices — it takes no lock of
 * the budget, so it cannot queue behind a decision while the transaction of the assignment holds the department.
 */
@Injectable()
export class BudgetHeadChangeListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;

  constructor(
    private readonly proposals: ProposalRepo,
    private readonly support: BudgetSupportService,
    private readonly notifier: BudgetNotifierService,
    private readonly changes: OrganizationChangeListeners,
  ) {}

  onModuleInit(): void {
    this.changes.add('budgets.head-change', (tx, change) => this.onChange(tx, change));
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'HEAD_PERIOD_START') return;
    const waiting = await this.proposals.returned(tx);
    if (waiting.length === 0) return;
    const departments = await this.support.departmentsOf(
      [...new Set(waiting.map((proposal) => proposal.costCenterId))],
      tx,
    );
    for (const proposal of waiting) {
      if (departments.get(proposal.costCenterId) !== change.departmentId) continue;
      await this.notifier.proposalPassedToHead(tx, proposal, change.departmentId, change.headEmployeeId);
    }
  }
}

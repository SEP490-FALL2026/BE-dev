import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  OrganizationChangeListeners,
  type OrganizationChangeListener,
} from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';

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
    private readonly versions: VersionRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly facts: BudgetFactsService,
    private readonly notifier: BudgetNotifierService,
    private readonly changes: OrganizationChangeListeners,
  ) {}

  onModuleInit(): void {
    this.changes.add('budgets.head-change', (tx, change) => this.onChange(tx, change));
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'HEAD_PERIOD_START') return;
    await this.tellOfBaselineVersions(tx, change.departmentId, change.headEmployeeId);
    await this.passReturnedProposals(tx, change.departmentId, change.headEmployeeId);
  }

  /** The versions Finance built from the baseline for the department and that are still in progress: the new head is told of them. */
  private async tellOfBaselineVersions(tx: DbTx, departmentId: string, headEmployeeId: string): Promise<void> {
    const costCenterId = (await this.organizationReads.getUnitCostCenterIds([departmentId], tx)).get(departmentId);
    if (costCenterId === undefined) return;
    for (const version of await this.versions.baselineInProgressOf(costCenterId, tx))
      await this.notifier.baselineVersionHeadAssigned(tx, version, headEmployeeId);
  }

  private async passReturnedProposals(tx: DbTx, departmentId: string, headEmployeeId: string): Promise<void> {
    const waiting = await this.proposals.returned(tx);
    if (waiting.length === 0) return;
    const departments = await this.facts.departmentsOf(
      [...new Set(waiting.map((proposal) => proposal.costCenterId))],
      tx,
    );
    for (const proposal of waiting) {
      if (departments.get(proposal.costCenterId) !== departmentId) continue;
      await this.notifier.proposalPassedToHead(tx, proposal, departmentId, headEmployeeId);
    }
  }
}

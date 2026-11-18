import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  SPENDING_APPROVER_BLOCKER_LIMIT,
  SpendingApproverGrantChecks,
  type SpendingApproverBlocker,
  type SpendingApproverGrantCheck,
} from '../../identity-access/public/identity-access.extension-points';
import { ProposalRepo } from '../budget/proposal.repo';

/**
 * The BM-10 proposals that keep a person from becoming the spending approver (`QĐ-93d`(3), `US-01-03` AC-13, OD-6): one they sent that
 * Finance has not dealt with, was given back, or was reviewed into a version nobody has decided. It adds itself to the checks of the grant
 * when the module starts, so identity-access never imports this module. One statement.
 */
@Injectable()
export class BudgetSpendingApproverGrantCheck implements SpendingApproverGrantCheck, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SpendingApproverGrantChecks] as const;

  constructor(
    private readonly proposals: ProposalRepo,
    private readonly checks: SpendingApproverGrantChecks,
  ) {}

  onModuleInit(): void {
    this.checks.add('budgets.open-proposals', this);
  }

  async blockersOf(tx: DbTx, employeeId: string): Promise<SpendingApproverBlocker[]> {
    const open = await this.proposals.inProgressOf(tx, employeeId, SPENDING_APPROVER_BLOCKER_LIMIT + 1);

    return open.map((proposal): SpendingApproverBlocker => ({
      kind: 'BUDGET_PROPOSAL',
      id: proposal.id,
      label: `Budget proposal for ${proposal.year}`,
    }));
  }
}

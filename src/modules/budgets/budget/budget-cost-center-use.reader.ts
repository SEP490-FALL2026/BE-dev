import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { CostCenterUseReader, UseGroup } from '../../organization/organization-use.types';
import { CommitmentRepo } from './commitment.repo';

/**
 * What the budgets context tells the organization about a Cost Center that is in use (`QĐ-87d(2)`, F16): the commitments still held
 * on it. It hands itself to the organization when the module starts, so the organization never imports budgets; the Requests with a
 * cost that are not over are told by the context of requests.
 */
@Injectable()
export class BudgetCostCenterUseReader implements CostCenterUseReader, OnModuleInit {
  readonly group = 'COMMITMENTS' as const;

  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerCostCenterUseReader(this);
  }

  /** Each commitment is labelled with its year: the label is never an amount. */
  async read(costCenterId: string, limit: number, tx?: DbTx): Promise<UseGroup> {
    const held = await this.commitments.heldOn(costCenterId, limit, tx);

    return {
      items: held.rows.map((row) => ({ kind: 'BUDGET_COMMITMENT', id: row.id, label: String(row.year) })),
      total: held.total,
    };
  }
}

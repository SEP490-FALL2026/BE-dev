import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import {
  CostCenterUseContributions,
  type CostCenterUseReader,
} from '../../../organization/public/organization.extension-points';
import type { UseGroup } from '../../../organization/public/organization-use.types';
import { RequestUseRepo, toUseGroup } from './request-use.repo';

/**
 * The requests with a cost, charged to a Cost Center, that are not over keep it in use (`REQUESTS`, `QĐ-87d(2)`): the commitments
 * still held are told by budgets. A free internal request charges nothing and a draft has no Cost Center, so neither is one of them.
 */
@Injectable()
export class CostCenterOpenRequestsReader implements CostCenterUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [CostCenterUseContributions] as const;

  readonly group = 'REQUESTS';

  constructor(
    private readonly repo: RequestUseRepo,
    private readonly costCenterUse: CostCenterUseContributions,
  ) {}

  onModuleInit(): void {
    this.costCenterUse.add('requests.open-requests', this);
  }

  async read(costCenterId: string, limit: number, tx?: DbTx): Promise<UseGroup> {
    return toUseGroup(await this.repo.ofCostCenter(costCenterId, limit, tx));
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { CostCenterUseReader, UseGroup } from '../../organization/organization-use.types';
import { RequestUseRepo, toUseGroup } from './request-use.repo';

/**
 * The requests with a cost, charged to a Cost Center, that are not over keep it in use (`REQUESTS`, `QĐ-87d(2)`, F16): the commitments
 * still held are told by budgets. A free internal request charges nothing (F91) and a draft has no Cost Center, so neither is one of them.
 */
@Injectable()
export class CostCenterOpenRequestsReader implements CostCenterUseReader, OnModuleInit {
  readonly group = 'REQUESTS';

  constructor(
    private readonly repo: RequestUseRepo,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerCostCenterUseReader(this);
  }

  async read(costCenterId: string, limit: number, tx?: DbTx): Promise<UseGroup> {
    return toUseGroup(await this.repo.ofCostCenter(costCenterId, limit, tx));
  }
}

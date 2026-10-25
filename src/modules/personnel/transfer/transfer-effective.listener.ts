import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { OrganizationChange, OrganizationChangeListener } from '../../organization/organization.types';
import { TransferSettlementService } from './transfer-settlement.service';

/**
 * Listens to the changes of the organization for the one that is a transfer reaching its day (`FR-3.16`): the placement a
 * waiting transfer opened has begun. Idempotent: a placement no transfer is waiting on, or one already settled, changes nothing.
 */
@Injectable()
export class TransferEffectiveListener implements OrganizationChangeListener, OnModuleInit {
  constructor(
    private readonly organization: OrganizationService,
    private readonly settlement: TransferSettlementService,
  ) {}

  onModuleInit(): void {
    this.organization.registerChangeListener(this);
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'PLACEMENT_START') return;
    await this.settlement.settleByPlacement(tx, change.placementId, 'ORGANIZATION_CHANGE', change.id);
  }
}

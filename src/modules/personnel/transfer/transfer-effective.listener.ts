import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  OrganizationChangeListeners,
  type OrganizationChangeListener,
} from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { TransferSettlementService } from './transfer-settlement.service';

/**
 * Listens to the changes of the organization for the one that is a transfer reaching its day (`FR-3.16`): the placement a
 * waiting transfer opened has begun. Idempotent: a placement no transfer is waiting on, or one already settled, changes nothing.
 */
@Injectable()
export class TransferEffectiveListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;

  constructor(
    private readonly changes: OrganizationChangeListeners,
    private readonly settlement: TransferSettlementService,
  ) {}

  onModuleInit(): void {
    this.changes.add('personnel.transfer-effective', (tx, change) => this.onChange(tx, change));
  }

  async onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'PLACEMENT_START') return;
    await this.settlement.settleByPlacement(tx, change.placementId, 'ORGANIZATION_CHANGE', change.id);
  }
}

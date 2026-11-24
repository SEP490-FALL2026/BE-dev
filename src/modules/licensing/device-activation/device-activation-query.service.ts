import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceActivationRepo } from './device-activation.repo';
import type { ActivationPageFilter, ActivationPageResult, ActivationRecord } from './device-activation.types';

/** Read-only queries for machine software activations across licensing and devices consumers. */
@Injectable()
export class DeviceActivationQueryService {
  constructor(private readonly repo: DeviceActivationRepo) {}

  find(activationId: string, tx?: DbTx): Promise<ActivationRecord | null> {
    return this.repo.findById(activationId, tx);
  }

  openOfDevice(deviceId: string, tx?: DbTx): Promise<ActivationRecord[]> {
    return this.repo.openOfDevice(deviceId, tx);
  }

  hasKeyActivationHistory(deviceId: string, tx?: DbTx): Promise<boolean> {
    return this.repo.hasKeyActivationHistory(deviceId, tx);
  }

  page(
    filter: ActivationPageFilter,
    pagination: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<ActivationPageResult> {
    return this.repo.page(filter, pagination, tx);
  }
}

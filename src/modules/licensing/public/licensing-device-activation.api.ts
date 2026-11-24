import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceActivationCloseService } from '../device-activation/device-activation-close.service';
import { DeviceActivationQueryService } from '../device-activation/device-activation-query.service';
import { DeviceActivationService } from '../device-activation/device-activation.service';
import type {
  ActivationPageFilter,
  ActivationPageResult,
  ActivationRecord,
  CloseActivationInput,
  CloseAllDeviceActivationsInput,
  MoveActivationInput,
  OpenActivationInput,
  OpenedActivation,
} from '../device-activation/device-activation.types';

/**
 * Public facade for machine software activations (`DEVICE_KEY` and `DEVICE_BUNDLED`), callable by `devices`.
 * Callers hold the device lock before entering write methods and execute within an existing transaction.
 */
@Injectable()
export class LicensingDeviceActivationApi {
  constructor(
    private readonly service: DeviceActivationService,
    private readonly closer: DeviceActivationCloseService,
    private readonly queries: DeviceActivationQueryService,
  ) {}

  open(tx: DbTx, input: OpenActivationInput): Promise<OpenedActivation> {
    return this.service.open(tx, input);
  }

  close(tx: DbTx, input: CloseActivationInput): Promise<ActivationRecord> {
    return this.closer.close(tx, input);
  }

  move(tx: DbTx, input: MoveActivationInput): Promise<OpenedActivation> {
    return this.closer.move(tx, input);
  }

  closeAllOfDevice(tx: DbTx, input: CloseAllDeviceActivationsInput): Promise<ActivationRecord[]> {
    return this.closer.closeAllOfDevice(tx, input);
  }

  find(activationId: string, tx?: DbTx): Promise<ActivationRecord | null> {
    return this.queries.find(activationId, tx);
  }

  openOfDevice(deviceId: string, tx?: DbTx): Promise<ActivationRecord[]> {
    return this.queries.openOfDevice(deviceId, tx);
  }

  hasKeyActivationHistory(deviceId: string, tx?: DbTx): Promise<boolean> {
    return this.queries.hasKeyActivationHistory(deviceId, tx);
  }

  page(
    filter: ActivationPageFilter,
    pagination: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<ActivationPageResult> {
    return this.queries.page(filter, pagination, tx);
  }
}

import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
} from '../../licensing/public/licensing-device-activation.errors';
import { DevicePlanNotBundledError } from '../registry/registry.errors';

export interface OpenInitialActivationsInput {
  bundledPlanIds: readonly string[];
  licenseKeyIds: readonly string[];
  on: BusinessDate;
  at: Date;
  bySubstitute: boolean;
}

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Opens initial (`origin: 'INITIAL'`) bundled and keyed activations for an initial device record.
 * Bundled plans are validated first so non-bundled plans fail with `DEVICE_ACTIVATION.PLAN_NOT_BUNDLED`;
 * keyed activations are ordered by `(subscriptionId ASC, licenseKeyId ASC)` so tier-6 subscription locks match `SPEC` §6.
 */
@Injectable()
export class InitialRecordActivationService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly deviceActivations: LicensingDeviceActivationApi,
  ) {}

  async openInitial(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    deviceId: string,
    input: OpenInitialActivationsInput,
  ): Promise<string[]> {
    const by = {
      kind: 'USER' as const,
      appUserId: actor.appUserId,
      employeeId: actor.employeeId,
      sessionId: actor.sessionId,
      bySubstitute: input.bySubstitute,
    };

    if (input.bundledPlanIds.length > 0) {
      await this.openBundled(tx, organizationId, deviceId, input.bundledPlanIds, { on: input.on, at: input.at, by });
    }

    return this.openKeyed(tx, organizationId, deviceId, input.licenseKeyIds, { on: input.on, at: input.at, by });
  }

  private async openKeyed(
    tx: DbTx,
    organizationId: string,
    deviceId: string,
    licenseKeyIds: readonly string[],
    context: {
      on: BusinessDate;
      at: Date;
      by: { kind: 'USER'; appUserId: string; employeeId: string; sessionId: string | null; bySubstitute: boolean };
    },
  ): Promise<string[]> {
    const uniqueKeyIds = [...new Set(licenseKeyIds)];
    if (uniqueKeyIds.length === 0) return [];
    const orderedKeyIds = await this.sortKeyIdsBySubscription(tx, uniqueKeyIds);

    const keyActivationIds: string[] = [];
    for (const licenseKeyId of orderedKeyIds) {
      const opened = await this.deviceActivations.openByKey(tx, {
        organizationId,
        deviceId,
        licenseKeyId,
        origin: 'INITIAL',
        on: context.on,
        at: context.at,
        by: context.by,
      });
      keyActivationIds.push(opened.activation.id);
    }

    return keyActivationIds;
  }

  /**
   * Orders the keys by the purchase they belong to, which is their lot (tier 6a): the order every writer of a lot takes its locks in, so two machines
   * opened at once never wait for each other in a circle. A key entered before lots is ordered by its subscription, which has the id of its lot.
   */
  private async sortKeyIdsBySubscription(tx: DbTx, licenseKeyIds: readonly string[]): Promise<string[]> {
    if (licenseKeyIds.length <= 1) return [...licenseKeyIds];
    const subscriptionByKeyId = await this.deviceActivations.keySubscriptionIds(licenseKeyIds, tx);

    return [...licenseKeyIds].sort(
      (left, right) =>
        compareText(subscriptionByKeyId.get(left) ?? '', subscriptionByKeyId.get(right) ?? '') ||
        compareText(left, right),
    );
  }

  private async openBundled(
    tx: DbTx,
    organizationId: string,
    deviceId: string,
    planIds: readonly string[],
    context: {
      on: BusinessDate;
      at: Date;
      by: { kind: 'USER'; appUserId: string; employeeId: string; sessionId: string | null; bySubstitute: boolean };
    },
  ): Promise<void> {
    const targets = await this.catalog.findPlanSeatTargets(planIds, tx);
    const byPlanId = new Map(targets.map((target) => [target.planId, target]));
    for (const planId of planIds) {
      const target = byPlanId.get(planId);
      if (!target || target.keyBinding !== 'DEVICE_BUNDLED') throw new DevicePlanNotBundledError();
    }

    for (const planId of planIds) {
      try {
        await this.deviceActivations.open(tx, {
          organizationId,
          deviceId,
          planId,
          licenseKeyId: null,
          origin: 'INITIAL',
          on: context.on,
          at: context.at,
          by: context.by,
        });
      } catch (error) {
        if (
          error instanceof DeviceActivationPlanNotFoundError ||
          error instanceof DeviceActivationPlanNotDeviceBoundError
        ) {
          throw new DevicePlanNotBundledError();
        }
        throw error;
      }
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { SeatTarget } from '../../catalog/public/catalog.types';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import {
  DeviceActivationAlreadyOnDeviceError,
  DeviceActivationKeyNotAllowedError,
  DeviceActivationKeyNotFoundError,
  DeviceActivationKeyNotOfPlanError,
  DeviceActivationKeyRequiredError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
  DeviceActivationPurchaseNotActiveError,
} from '../public/licensing-device-activation.errors';
import {
  activationsUsed,
  freeLicenses,
  isOverCap,
  judgeOpen,
  type OpenActivationVerdict,
} from './device-activation.policy';
import { DeviceActivationRepo, type KeyActivationMeta } from './device-activation.repo';
import type {
  ActivationActor,
  ActivationRecord,
  OpenActivationByKeyInput,
  OpenActivationInput,
  OpenedActivation,
} from './device-activation.types';

/**
 * Coordinates opening device software activations while enforcing lot capacity, key usability, and lock hierarchy.
 *
 * Lock order: caller holds the machine lock (tier 2b); this service locks the lot of licenses the key belongs to via
 * `LicenseLotApi.lockLot` (tier 6a, then the plan, tier 7), then the key `FOR SHARE` (tier 7b), before inserting `device_activations` (tier 8).
 */
@Injectable()
export class DeviceActivationService {
  constructor(
    private readonly repo: DeviceActivationRepo,
    private readonly catalog: CatalogApi,
    private readonly lots: LicenseLotApi,
    private readonly audit: AuditApi,
  ) {}

  /** Opens a `DEVICE_BUNDLED` or `DEVICE_KEY` activation on a device inside the caller's transaction. */
  async open(tx: DbTx, input: OpenActivationInput): Promise<OpenedActivation> {
    const at = input.at ?? new Date();
    const [planTarget] = await this.catalog.findPlanSeatTargets([input.planId], tx);
    const activePlan = planTarget && planTarget.applicationStatus === 'APPROVED' ? planTarget : null;

    if (!activePlan || activePlan.keyBinding !== 'DEVICE_KEY') {
      return this.openNonKeyedPlan(tx, activePlan, input, at);
    }

    return this.openKeyedPlan(tx, activePlan, input, at);
  }

  /** Opens a `DEVICE_KEY` activation by resolving `planId` from `licenseKeyId` inside the caller's transaction. */
  async openByKey(tx: DbTx, input: OpenActivationByKeyInput): Promise<OpenedActivation> {
    const probe = await this.repo.findKeyWithMeta(tx, input.licenseKeyId);
    if (!probe) throw new DeviceActivationKeyNotFoundError();

    const [planTarget] = await this.catalog.findPlanSeatTargets([probe.planId], tx);
    if (!planTarget || planTarget.applicationStatus !== 'APPROVED') throw new DeviceActivationPlanNotFoundError();
    if (planTarget.keyBinding !== 'DEVICE_KEY') throw new DeviceActivationPlanNotDeviceBoundError();

    return this.openKeyedPlan(tx, planTarget, { ...input, planId: probe.planId }, input.at ?? new Date());
  }

  private async openNonKeyedPlan(
    tx: DbTx,
    planTarget: SeatTarget | null,
    input: OpenActivationInput,
    at: Date,
  ): Promise<OpenedActivation> {
    this.assertOpenVerdict(
      judgeOpen({
        planExists: planTarget !== null,
        planKeyBinding: planTarget?.keyBinding ?? null,
        licenseKeyId: input.licenseKeyId,
        keyExists: false,
        keyPlanId: null,
        planId: input.planId,
        purchaseKind: null,
        purchaseStatus: null,
        keyWithdrawn: false,
        freeLicenseCount: 0,
      }),
    );

    const activation = await this.insertActivation(tx, { ...input, at, overActivationCap: false });
    await this.recordAudit(tx, 'DEVICE_ACTIVATION.OPENED', activation, input.by, {
      origin: input.origin,
      overActivationCap: false,
    });

    return { activation, activationsUsed: null, maxActivations: null, overActivationCap: false };
  }

  private async openKeyedPlan(
    tx: DbTx,
    planTarget: SeatTarget,
    input: OpenActivationInput,
    at: Date,
  ): Promise<OpenedActivation> {
    if (!input.licenseKeyId) throw new DeviceActivationKeyRequiredError();
    const probe = await this.repo.findKeyWithMeta(tx, input.licenseKeyId);
    if (!probe) throw new DeviceActivationKeyNotFoundError();
    if (probe.planId !== input.planId) throw new DeviceActivationKeyNotOfPlanError();

    const purchase = await this.lots.lockLot(tx, probe.subscriptionId);
    await this.repo.lockKeyForShare(tx, probe.id);
    const keyMeta = (await this.repo.findKeyWithMeta(tx, probe.id)) ?? probe;
    const occupiedCount = await this.repo.occupiedBySubscription(keyMeta.subscriptionId, tx);
    const operationCount = await this.repo.countOperationActivationsOfKey(tx, keyMeta.id);

    this.assertOpenKeyedReady(planTarget, keyMeta, purchase, occupiedCount, input);

    const nextOperationCount = operationCount + (input.origin === 'OPERATION' ? 1 : 0);
    const usedAfterOpen = activationsUsed({
      initialActivationsUsed: keyMeta.initialActivationsUsed,
      operationActivationCount: nextOperationCount,
    });
    const overCap =
      input.origin === 'OPERATION' && isOverCap({ usedAfterOpen, maxActivations: keyMeta.maxActivations });

    const activation = await this.insertActivation(tx, { ...input, at, overActivationCap: overCap });
    await this.recordAudit(tx, 'DEVICE_ACTIVATION.OPENED', activation, input.by, {
      origin: input.origin,
      overActivationCap: overCap,
    });

    return {
      activation,
      activationsUsed: usedAfterOpen,
      maxActivations: keyMeta.maxActivations,
      overActivationCap: overCap,
    };
  }

  private assertOpenKeyedReady(
    planTarget: SeatTarget,
    keyMeta: KeyActivationMeta,
    purchase: LicenseLotView | null,
    occupiedCount: number,
    input: OpenActivationInput,
  ): void {
    // A lot is a purchase of a K4 plan that can always give its licenses out: it has no draft state.
    const purchaseKind = purchase ? 'PERPETUAL' : null;
    const freeCount = purchase ? freeLicenses({ purchasedQuantity: purchase.licenseCount, occupiedCount }) : 0;

    this.assertOpenVerdict(
      judgeOpen({
        planExists: true,
        planKeyBinding: planTarget.keyBinding,
        licenseKeyId: input.licenseKeyId,
        keyExists: true,
        keyPlanId: keyMeta.planId,
        planId: input.planId,
        purchaseKind,
        purchaseStatus: purchase ? 'ACTIVE' : null,
        keyWithdrawn: keyMeta.withdrawnAt !== null,
        freeLicenseCount: freeCount,
      }),
    );
  }

  private async insertActivation(
    tx: DbTx,
    input: OpenActivationInput & { at: Date; overActivationCap: boolean },
  ): Promise<ActivationRecord> {
    const activatedByAppUserId = input.by.kind === 'USER' ? input.by.appUserId : input.by.correlationId;
    try {
      return await this.repo.insert(tx, {
        organizationId: input.organizationId,
        deviceId: input.deviceId,
        planId: input.planId,
        licenseKeyId: input.licenseKeyId,
        origin: input.origin,
        movedFromActivationId: null,
        activatedOn: input.on,
        activatedAt: input.at,
        activatedByAppUserId,
        overActivationCap: input.overActivationCap,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'device_activations_one_open')) throw new DeviceActivationAlreadyOnDeviceError();
      if (isCheckViolation(error, 'device_activations_lot_capacity')) throw new DeviceActivationLotFullError();
      if (isCheckViolation(error, 'device_activations_key_usable')) throw new DeviceActivationKeyWithdrawnError();
      throw error;
    }
  }

  private assertOpenVerdict(verdict: OpenActivationVerdict): void {
    switch (verdict) {
      case 'OK':
        return;
      case 'PLAN_NOT_FOUND':
        throw new DeviceActivationPlanNotFoundError();
      case 'PLAN_NOT_DEVICE_BOUND':
        throw new DeviceActivationPlanNotDeviceBoundError();
      case 'KEY_NOT_ALLOWED':
        throw new DeviceActivationKeyNotAllowedError();
      case 'KEY_REQUIRED':
        throw new DeviceActivationKeyRequiredError();
      case 'KEY_NOT_FOUND':
        throw new DeviceActivationKeyNotFoundError();
      case 'KEY_NOT_OF_PLAN':
        throw new DeviceActivationKeyNotOfPlanError();
      case 'PURCHASE_NOT_ACTIVE':
        throw new DeviceActivationPurchaseNotActiveError();
      case 'KEY_WITHDRAWN':
        throw new DeviceActivationKeyWithdrawnError();
      case 'LOT_FULL':
        throw new DeviceActivationLotFullError();
    }
  }

  private async recordAudit(
    tx: DbTx,
    action: string,
    activation: ActivationRecord,
    by: ActivationActor,
    extra: Record<string, AuditValue>,
  ): Promise<void> {
    const after: { [key: string]: AuditValue } = {
      deviceId: activation.deviceId,
      planId: activation.planId,
      licenseKeyId: activation.licenseKeyId,
      ...extra,
    };
    if (by.kind === 'USER' && by.bySubstitute) after.bySubstitute = true;
    await this.audit.record(tx, {
      organizationId: activation.organizationId,
      actorKind: by.kind === 'USER' ? 'USER' : 'SYSTEM',
      actorAppUserId: by.kind === 'USER' ? by.appUserId : null,
      actorRoles: by.kind === 'USER' ? ['IT_ADMIN'] : [],
      action,
      resourceType: 'DeviceActivation',
      resourceId: activation.id,
      before: null,
      after,
      correlationId: by.kind === 'USER' ? (by.sessionId ?? by.appUserId) : by.correlationId,
    });
  }
}

import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import {
  DeviceActivationAlreadyClosedError,
  DeviceActivationAlreadyOnDeviceError,
  DeviceActivationKeyWithdrawnError,
  DeviceActivationLotFullError,
  DeviceActivationNotFoundError,
  DeviceActivationNotMovableError,
  DeviceActivationNotOnDeviceError,
  DeviceActivationPurchaseNotActiveError,
  DeviceActivationReleaseNotApplicableError,
} from '../public/licensing-device-activation.errors';
import { activationsUsed, isOverCap, judgeDecision, judgeMove } from './device-activation.policy';
import { DeviceActivationRepo } from './device-activation.repo';
import type {
  ActivationActor,
  ActivationRecord,
  CloseActivationInput,
  CloseAllDeviceActivationsInput,
  DeviceActivationDecisionInput,
  MoveActivationInput,
  OpenedActivation,
} from './device-activation.types';

/**
 * Coordinates closing and moving machine software activations (`DEACTIVATED`, `MOVED`, or device retirement/loss/voiding)
 * while maintaining purchase -> key -> activation lock order and closing the source row before inserting a moved target.
 */
@Injectable()
export class DeviceActivationCloseService {
  constructor(
    private readonly repo: DeviceActivationRepo,
    private readonly lots: LicenseLotApi,
    private readonly audit: AuditApi,
  ) {}

  /** Closes one open activation (`DEACTIVATED`), returning the keyed license to the lot unless `LOST_WITH_DEVICE`. */
  async close(tx: DbTx, input: CloseActivationInput): Promise<ActivationRecord> {
    const at = input.at ?? new Date();
    const probe = await this.repo.findById(input.activationId, tx);
    if (!probe) throw new DeviceActivationNotFoundError();
    if (probe.subscriptionId && probe.licenseKeyId) {
      await this.lots.lockLot(tx, probe.subscriptionId);
      await this.repo.lockKeyForShare(tx, probe.licenseKeyId);
    }

    const current = await this.repo.lockById(tx, input.activationId);
    if (!current) throw new DeviceActivationNotFoundError();
    const verdict = judgeDecision({
      isOpen: current.deactivatedAt === null,
      isDeviceKey: current.licenseKeyId !== null,
      hasLicenseRelease: input.licenseRelease !== undefined,
    });
    if (verdict === 'ALREADY_CLOSED') throw new DeviceActivationAlreadyClosedError();
    if (verdict === 'RELEASE_NOT_APPLICABLE') throw new DeviceActivationReleaseNotApplicableError();

    const licenseReleased = current.licenseKeyId !== null ? input.licenseRelease !== 'LOST_WITH_DEVICE' : null;
    const closed = await this.repo.close(tx, current.id, {
      deactivatedOn: input.on,
      deactivatedAt: at,
      endCause: input.cause,
      licenseReleased,
      closedByAppUserId: this.actorUserId(input.by),
    });
    await this.recordAudit(tx, 'DEVICE_ACTIVATION.CLOSED', closed, input.by, {
      endCause: input.cause,
      licenseReleased,
    });

    return closed;
  }

  /**
   * Moves an open `DEVICE_KEY` activation to `targetDeviceId`: locks purchase -> key -> closes old row (`MOVED`)
   * BEFORE inserting the new activation row so PostgreSQL lot capacity counts never double-count during the swap.
   */
  async move(tx: DbTx, input: MoveActivationInput): Promise<OpenedActivation> {
    const at = input.at ?? new Date();
    const probe = await this.repo.findById(input.activationId, tx);
    if (!probe) throw new DeviceActivationNotFoundError();
    this.assertProbeMovable(probe, input.targetDeviceId);

    const purchase = await this.lots.lockLot(tx, probe.subscriptionId!);
    await this.repo.lockKeyForShare(tx, probe.licenseKeyId!);
    const current = await this.repo.lockById(tx, input.activationId);
    if (!current) throw new DeviceActivationNotFoundError();

    const keyMeta = await this.repo.findKeyWithMeta(tx, current.licenseKeyId!);
    // A lot is a purchase of a K4 plan that can always give its licenses out: it has no draft state.
    if (!purchase) throw new DeviceActivationPurchaseNotActiveError();
    const moveVerdict = judgeMove({
      isOpen: current.deactivatedAt === null,
      isDeviceKey: current.licenseKeyId !== null,
      sourceDeviceId: current.deviceId,
      targetDeviceId: input.targetDeviceId,
      keyWithdrawn: keyMeta ? keyMeta.withdrawnAt !== null : true,
    });
    this.assertMoveVerdict(moveVerdict);

    const operationCount = await this.repo.countOperationActivationsOfKey(tx, keyMeta!.id);
    const usedAfterMove = activationsUsed({
      initialActivationsUsed: keyMeta!.initialActivationsUsed,
      operationActivationCount: operationCount + 1,
    });
    const overCap = isOverCap({ usedAfterOpen: usedAfterMove, maxActivations: keyMeta!.maxActivations });
    const actorUserId = this.actorUserId(input.by);

    await this.repo.close(tx, current.id, {
      deactivatedOn: input.on,
      deactivatedAt: at,
      endCause: 'MOVED',
      licenseReleased: true,
      closedByAppUserId: actorUserId,
    });
    const created = await this.insertMovedActivation(tx, current, input, at, actorUserId, overCap);
    await this.recordAudit(tx, 'DEVICE_ACTIVATION.MOVED', created, input.by, {
      fromDeviceId: current.deviceId,
      movedFromActivationId: current.id,
      overActivationCap: overCap,
    });

    return {
      activation: created,
      activationsUsed: usedAfterMove,
      maxActivations: keyMeta!.maxActivations,
      overActivationCap: overCap,
    };
  }

  /** Closes every open activation on `deviceId` (device retirement, loss, or voiding) in sorted lot order (tier 6a). */
  async closeAllOfDevice(tx: DbTx, input: CloseAllDeviceActivationsInput): Promise<ActivationRecord[]> {
    const at = input.at ?? new Date();
    const openProbe = await this.repo.openOfDevice(input.deviceId, tx);
    this.validateDecisions(openProbe, input.decisions ?? []);

    const subscriptionIds = [
      ...new Set(openProbe.map((row) => row.subscriptionId).filter((id): id is string => id !== null)),
    ].sort();
    for (const subscriptionId of subscriptionIds) {
      await this.lots.lockLot(tx, subscriptionId);
    }
    const locked = await this.repo.lockOpenOfDevice(tx, input.deviceId);
    const decisionMap = this.validateDecisions(locked, input.decisions ?? []);

    const closedList: ActivationRecord[] = [];
    const closedByAppUserId = this.actorUserId(input.by);
    for (const activation of locked) {
      const release = decisionMap.get(activation.id);
      const licenseReleased = activation.licenseKeyId !== null ? release !== 'LOST_WITH_DEVICE' : null;
      const closed = await this.repo.close(tx, activation.id, {
        deactivatedOn: input.on,
        deactivatedAt: at,
        endCause: input.cause,
        licenseReleased,
        closedByAppUserId,
      });
      await this.recordAudit(tx, 'DEVICE_ACTIVATION.CLOSED', closed, input.by, {
        endCause: input.cause,
        licenseReleased,
      });
      closedList.push(closed);
    }

    return closedList;
  }

  private assertProbeMovable(probe: ActivationRecord, targetDeviceId: string): void {
    if (probe.deactivatedAt !== null) throw new DeviceActivationAlreadyClosedError();
    if (probe.licenseKeyId === null || probe.subscriptionId === null) throw new DeviceActivationNotMovableError();
    if (probe.deviceId === targetDeviceId) throw new DeviceActivationNotMovableError();
  }

  private assertMoveVerdict(verdict: ReturnType<typeof judgeMove>): void {
    if (verdict === 'ALREADY_CLOSED') throw new DeviceActivationAlreadyClosedError();
    if (verdict === 'NOT_MOVABLE' || verdict === 'SAME_DEVICE') throw new DeviceActivationNotMovableError();
    if (verdict === 'KEY_WITHDRAWN') throw new DeviceActivationKeyWithdrawnError();
  }

  private validateDecisions(
    openRows: readonly ActivationRecord[],
    decisions: readonly DeviceActivationDecisionInput[],
  ): Map<string, 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' | undefined> {
    const byId = new Map(openRows.map((row) => [row.id, row]));
    const result = new Map<string, 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' | undefined>();
    for (const decision of decisions) {
      const row = byId.get(decision.activationId);
      if (!row) throw new DeviceActivationNotOnDeviceError();
      if (row.licenseKeyId === null && decision.licenseRelease !== undefined) {
        throw new DeviceActivationReleaseNotApplicableError();
      }
      result.set(decision.activationId, decision.licenseRelease);
    }

    return result;
  }

  private async insertMovedActivation(
    tx: DbTx,
    previous: ActivationRecord,
    input: MoveActivationInput,
    at: Date,
    actorUserId: string,
    overActivationCap: boolean,
  ): Promise<ActivationRecord> {
    try {
      return await this.repo.insert(tx, {
        organizationId: previous.organizationId,
        deviceId: input.targetDeviceId,
        planId: previous.planId,
        licenseKeyId: previous.licenseKeyId,
        origin: 'OPERATION',
        movedFromActivationId: previous.id,
        activatedOn: input.on,
        activatedAt: at,
        activatedByAppUserId: actorUserId,
        overActivationCap,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'device_activations_one_open')) throw new DeviceActivationAlreadyOnDeviceError();
      if (isCheckViolation(error, 'device_activations_lot_capacity')) throw new DeviceActivationLotFullError();
      if (isCheckViolation(error, 'device_activations_key_usable')) throw new DeviceActivationKeyWithdrawnError();
      throw error;
    }
  }

  private actorUserId(by: ActivationActor): string {
    return by.kind === 'USER' ? by.appUserId : by.correlationId;
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

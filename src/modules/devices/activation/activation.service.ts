import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationNotFoundError,
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
} from '../../licensing/public/licensing-device-activation.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { custodyOf, judgeKeyActivationTarget, type DeviceCustody } from '../devices-custody.policy';
import {
  DeviceAwaitingReturnError,
  DeviceNotUsableError,
  DeviceSameDeviceError,
  DeviceVoidedError,
} from '../lifecycle/lifecycle.errors';
import { requireDepartmentActor, requireLifecycleActor } from '../lifecycle/lifecycle.mapper';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo, type DeviceRecord } from '../registry/registry.repo';

type OpenedActivation = Awaited<ReturnType<LicensingDeviceActivationApi['open']>>;
type ActivationRecord = OpenedActivation['activation'];

export interface OpenDeviceActivationCommand {
  planId: string;
  licenseKeyId?: string | undefined;
}

export interface DeactivateDeviceActivationCommand {
  licenseRelease?: 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' | undefined;
}

export interface MoveDeviceActivationCommand {
  targetDeviceId: string;
}

interface LockedDeviceState {
  device: DeviceRecord;
  custody: DeviceCustody;
  holderEmployeeId: string | null;
  returnTask: { found: boolean; departmentId: string | null };
}

/**
 * Coordinates opening, deactivating, and moving device-bound software activations under consistent lock ordering:
 * machines sorted by `id` FOR UPDATE -> open registrations FOR UPDATE -> purchase FOR UPDATE -> key FOR SHARE.
 */
@Injectable()
export class DeviceActivationCommandService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly catalog: CatalogApi,
    private readonly deviceActivations: LicensingDeviceActivationApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Opens one `DEVICE_BUNDLED` or `DEVICE_KEY` activation on `deviceId`. */
  async open(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    input: OpenDeviceActivationCommand,
    now: Date = new Date(),
  ): Promise<OpenedActivation> {
    return this.runner.run(async (tx) => {
      const state = await this.lockSingleDeviceState(tx, deviceId);
      if (state.custody === 'VOIDED') throw new DeviceVoidedError();
      if (state.custody === 'RETIRED') throw new DeviceAlreadyRetiredError();

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await this.assertActorInCharge(tx, actor, state, today);

      const targets = await this.catalog.findPlanSeatTargets([input.planId], tx);
      const target = targets[0];
      if (!target) throw new DeviceActivationPlanNotFoundError();
      if (target.keyBinding !== 'DEVICE_BUNDLED' && target.keyBinding !== 'DEVICE_KEY') {
        throw new DeviceActivationPlanNotDeviceBoundError();
      }

      this.assertTargetReady(state.custody, state.device.condition, target.keyBinding);

      return this.deviceActivations.open(tx, {
        organizationId: state.device.organizationId,
        deviceId,
        planId: input.planId,
        licenseKeyId: input.licenseKeyId ?? null,
        origin: 'OPERATION',
        on: today,
        at: now,
        by: this.userActor(actor, bySubstitute),
      });
    });
  }

  /** Deactivates one open activation on its current machine (`DEACTIVATED`). */
  async deactivate(
    actor: AuthenticatedPrincipal,
    activationId: string,
    input: DeactivateDeviceActivationCommand,
    now: Date = new Date(),
  ): Promise<ActivationRecord> {
    const found = await this.deviceActivations.find(activationId);
    if (!found) throw new DeviceActivationNotFoundError();

    return this.runner.run(async (tx) => {
      const state = await this.lockSingleDeviceState(tx, found.deviceId);
      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await this.assertActorInCharge(tx, actor, state, today);

      return this.deviceActivations.close(tx, {
        activationId,
        cause: 'DEACTIVATED',
        licenseRelease: input.licenseRelease,
        on: today,
        at: now,
        by: this.userActor(actor, bySubstitute),
      });
    });
  }

  /** Moves an open `DEVICE_KEY` activation from its current machine to `targetDeviceId`. */
  async move(
    actor: AuthenticatedPrincipal,
    activationId: string,
    input: MoveDeviceActivationCommand,
    now: Date = new Date(),
  ): Promise<OpenedActivation> {
    const found = await this.deviceActivations.find(activationId);
    if (!found) throw new DeviceActivationNotFoundError();
    if (found.deviceId === input.targetDeviceId) throw new DeviceSameDeviceError();

    return this.runner.run(async (tx) => {
      const states = await this.lockOrderedDeviceStates(tx, found.deviceId, input.targetDeviceId);
      const today = await this.organizationReads.businessToday(now, tx);
      const sourceSub = await this.assertActorInCharge(tx, actor, states.source, today);
      const targetSub = await this.assertActorInCharge(tx, actor, states.target, today);
      this.assertTargetReady(states.target.custody, states.target.device.condition, 'DEVICE_KEY');

      return this.deviceActivations.move(tx, {
        activationId,
        targetDeviceId: input.targetDeviceId,
        on: today,
        at: now,
        by: this.userActor(actor, sourceSub || targetSub),
      });
    });
  }

  private async lockSingleDeviceState(tx: DbTx, deviceId: string): Promise<LockedDeviceState> {
    const device = await this.repo.lockDevice(tx, deviceId);
    if (!device) throw new DeviceNotFoundError();

    return this.readLockedDeviceState(tx, device);
  }

  private async lockOrderedDeviceStates(
    tx: DbTx,
    sourceId: string,
    targetId: string,
  ): Promise<{ source: LockedDeviceState; target: LockedDeviceState }> {
    const sortedIds = [sourceId, targetId].sort();
    const locked = await this.repo.lockDevices(tx, sortedIds);
    const byId = new Map(locked.map((device) => [device.id, device]));
    const sourceDevice = byId.get(sourceId);
    const targetDevice = byId.get(targetId);
    if (!sourceDevice || !targetDevice) throw new DeviceNotFoundError();

    const stateById = new Map<string, LockedDeviceState>();
    for (const id of sortedIds) {
      const device = byId.get(id)!;
      stateById.set(id, await this.readLockedDeviceState(tx, device));
    }

    return { source: stateById.get(sourceId)!, target: stateById.get(targetId)! };
  }

  private async readLockedDeviceState(tx: DbTx, device: DeviceRecord): Promise<LockedDeviceState> {
    const open = await this.repo.lockOpenRegistration(tx, device.id);
    const returnTask = await this.repo.findOpenReturnTaskDepartmentId(tx, device.id);
    const custody = custodyOf({
      voidedAt: device.voidedAt,
      retiredAt: device.retiredAt,
      hasOpenReturnTask: returnTask.found,
      hasOpenRegistration: open !== null,
    });

    return { device, custody, holderEmployeeId: open?.holderEmployeeId ?? null, returnTask };
  }

  private async assertActorInCharge(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    state: LockedDeviceState,
    today: string,
  ): Promise<boolean> {
    if (state.returnTask.found) {
      return requireDepartmentActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        { actorEmployeeId: actor.employeeId, departmentId: state.returnTask.departmentId },
      );
    }
    if (state.custody === 'ASSIGNED' && state.holderEmployeeId) {
      return requireLifecycleActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        {
          actorEmployeeId: actor.employeeId,
          today,
          oldHolderEmployeeId: state.holderEmployeeId,
          recipientEmployeeId: null,
        },
      );
    }

    return false;
  }

  private assertTargetReady(
    custody: DeviceCustody,
    condition: 'USABLE' | 'IN_REPAIR' | 'BROKEN',
    binding: 'DEVICE_BUNDLED' | 'DEVICE_KEY',
  ): void {
    const verdict = judgeKeyActivationTarget({ custody, condition, binding });
    if (verdict === 'VOIDED') throw new DeviceVoidedError();
    if (verdict === 'ALREADY_RETIRED') throw new DeviceAlreadyRetiredError();
    if (verdict === 'AWAITING_RETURN') throw new DeviceAwaitingReturnError();
    if (verdict === 'NOT_USABLE') throw new DeviceNotUsableError();
  }

  private userActor(actor: AuthenticatedPrincipal, bySubstitute: boolean) {
    return {
      kind: 'USER' as const,
      appUserId: actor.appUserId,
      employeeId: actor.employeeId,
      sessionId: actor.sessionId,
      bySubstitute,
    };
  }
}

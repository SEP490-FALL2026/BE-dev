import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationPlanNotDeviceBoundError,
  DeviceActivationPlanNotFoundError,
} from '../../licensing/public/licensing-device-activation.errors';

type OpenedActivation = Awaited<ReturnType<LicensingDeviceActivationApi['open']>>;
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { custodyOf, judgeKeyActivationTarget, type DeviceCustody } from '../devices-custody.policy';
import { DeviceAwaitingReturnError, DeviceNotUsableError, DeviceVoidedError } from '../lifecycle/lifecycle.errors';
import { requireDepartmentActor, requireLifecycleActor } from '../lifecycle/lifecycle.mapper';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';

export interface OpenDeviceActivationCommand {
  planId: string;
  licenseKeyId?: string | undefined;
}

/**
 * Coordinates opening device-bound software activations on a registered machine under consistent lock ordering:
 * machine FOR UPDATE -> open registration FOR UPDATE -> purchase FOR UPDATE -> key FOR SHARE -> insert.
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
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);
      const returnTask = await this.repo.findOpenReturnTaskDepartmentId(tx, deviceId);

      const custody = custodyOf({
        voidedAt: device.voidedAt,
        retiredAt: device.retiredAt,
        hasOpenReturnTask: returnTask.found,
        hasOpenRegistration: open !== null,
      });
      if (custody === 'VOIDED') throw new DeviceVoidedError();
      if (custody === 'RETIRED') throw new DeviceAlreadyRetiredError();

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await this.assertActorInCharge(
        tx,
        actor,
        custody,
        open?.holderEmployeeId ?? null,
        returnTask,
        today,
      );

      const targets = await this.catalog.findPlanSeatTargets([input.planId], tx);
      const target = targets[0];
      if (!target) throw new DeviceActivationPlanNotFoundError();
      if (target.keyBinding !== 'DEVICE_BUNDLED' && target.keyBinding !== 'DEVICE_KEY') {
        throw new DeviceActivationPlanNotDeviceBoundError();
      }

      this.assertTargetReady(custody, device.condition, target.keyBinding);

      return this.deviceActivations.open(tx, {
        organizationId: device.organizationId,
        deviceId,
        planId: input.planId,
        licenseKeyId: input.licenseKeyId ?? null,
        origin: 'OPERATION',
        on: today,
        at: now,
        by: {
          kind: 'USER',
          appUserId: actor.appUserId,
          employeeId: actor.employeeId,
          sessionId: actor.sessionId,
          bySubstitute,
        },
      });
    });
  }

  private async assertActorInCharge(
    tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0],
    actor: AuthenticatedPrincipal,
    custody: DeviceCustody,
    holderEmployeeId: string | null,
    returnTask: { found: boolean; departmentId: string | null },
    today: string,
  ): Promise<boolean> {
    if (returnTask.found) {
      return requireDepartmentActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        { actorEmployeeId: actor.employeeId, departmentId: returnTask.departmentId },
      );
    }
    if (custody === 'ASSIGNED' && holderEmployeeId) {
      return requireLifecycleActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        {
          actorEmployeeId: actor.employeeId,
          today,
          oldHolderEmployeeId: holderEmployeeId,
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
}

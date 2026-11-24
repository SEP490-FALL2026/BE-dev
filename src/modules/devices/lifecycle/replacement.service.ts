import { Injectable } from '@nestjs/common';
import { readSqlState, TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import {
  DeviceActivationNotMovableError,
  DeviceActivationNotOnDeviceError,
} from '../../licensing/public/licensing-device-activation.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf, type DeviceCondition } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationOverlapError,
} from '../registry/registry.errors';
import { judgeHolder } from '../registry/registry.policy';
import { RegistryRepo, type DeviceRecord, type RegistrationRecord } from '../registry/registry.repo';
import { DeviceReceiptService } from './device-receipt.service';
import {
  DeviceAwaitingReturnError,
  DeviceNotHeldError,
  DeviceNotUsableError,
  DeviceReplacementNotInStockError,
  DeviceSameDeviceError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';
import { normalizeSoftwareRemoval, requireLifecycleActor, type NormalizedSoftwareRemoval } from './lifecycle.mapper';
import { judgeReplace, judgeSoftwareRemoval, type SoftwareRemovalInput } from './lifecycle.policy';

type ActivationRecord = Awaited<ReturnType<LicensingDeviceActivationApi['openOfDevice']>>[number];

export interface DeviceReplacementActivationChoice {
  activationId: string;
  action: 'MOVE' | 'STAY';
}

export interface DeviceReplacementInput {
  replacementDeviceId: string;
  condition: DeviceCondition;
  conditionNote?: string | undefined;
  softwareRemoval: SoftwareRemovalInput;
  collectorInstalled: boolean;
  activations?: readonly DeviceReplacementActivationChoice[] | undefined;
}

export interface DeviceReplacementResult {
  returnedDeviceId: string;
  replacementDeviceId: string;
  movedActivations: Array<{ activationId: string; overActivationCap: boolean }>;
}

/**
 * Atomically replaces an assigned machine with a usable in-stock machine for the same holder, optionally moving
 * selected keyed activations in sorted subscription order.
 *
 * Lock order: holder FOR SHARE (tier 1) -> devices sorted by `id` FOR UPDATE (tier 2b) -> open registrations sorted
 * by device `id` FOR UPDATE -> licensing purchase/key locks in sorted subscription order.
 */
@Injectable()
export class ReplacementService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly receipts: DeviceReceiptService,
    private readonly activations: LicensingDeviceActivationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Swaps `oldDeviceId` for `input.replacementDeviceId` for the current holder in one transaction. */
  async replace(
    actor: AuthenticatedPrincipal,
    oldDeviceId: string,
    input: DeviceReplacementInput,
    now: Date = new Date(),
  ): Promise<DeviceReplacementResult> {
    if (oldDeviceId === input.replacementDeviceId) throw new DeviceSameDeviceError();
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const openProbe = await this.repo.findOpenRegistration(oldDeviceId, tx);
      if (openProbe) await this.organizationReads.lockEmployeeForShare(tx, openProbe.holderEmployeeId);

      const state = await this.lockAndValidate(tx, oldDeviceId, input);
      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await requireLifecycleActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        {
          actorEmployeeId: actor.employeeId,
          today,
          deviceId: oldDeviceId,
          oldHolderEmployeeId: state.oldOpen.holderEmployeeId,
          recipientEmployeeId: state.oldOpen.holderEmployeeId,
        },
      );
      const toMove = await this.validateAndSortMovableActivations(tx, oldDeviceId, input.activations ?? []);

      await this.receipts.receive(tx, {
        organizationId: organization.id,
        actor,
        deviceId: oldDeviceId,
        openRegistration: state.oldOpen,
        condition: input.condition,
        conditionNote: input.conditionNote ?? null,
        softwareRemoval: state.removal,
        now,
        bySubstitute,
        recordAudit: false,
      });
      await this.insertReplacementRegistration(
        tx,
        actor,
        organization.id,
        state.oldOpen.holderEmployeeId,
        today,
        input,
      );
      const movedActivations = await this.moveSelectedActivations(tx, actor, toMove, {
        targetDeviceId: input.replacementDeviceId,
        on: today,
        at: now,
        bySubstitute,
      });
      await this.recordAudit(tx, actor, organization.id, oldDeviceId, state.oldOpen.holderEmployeeId, {
        input,
        removal: state.removal,
        movedCount: movedActivations.length,
        bySubstitute,
      });

      return { returnedDeviceId: oldDeviceId, replacementDeviceId: input.replacementDeviceId, movedActivations };
    });
  }

  private async lockAndValidate(
    tx: DbTx,
    oldDeviceId: string,
    input: DeviceReplacementInput,
  ): Promise<{ oldOpen: RegistrationRecord; removal: NormalizedSoftwareRemoval }> {
    const { oldDevice, replacementDevice, oldOpen, replacementOpen } = await this.lockPair(
      tx,
      oldDeviceId,
      input.replacementDeviceId,
    );
    const oldReturnTask = await this.repo.hasOpenReturnTask(tx, oldDeviceId);
    const replacementReturnTask = await this.repo.hasOpenReturnTask(tx, input.replacementDeviceId);
    const oldCustody = custodyOf({
      voidedAt: oldDevice.voidedAt,
      retiredAt: oldDevice.retiredAt,
      hasOpenReturnTask: oldReturnTask,
      hasOpenRegistration: oldOpen !== null,
    });
    const replacementCustody = custodyOf({
      voidedAt: replacementDevice.voidedAt,
      retiredAt: replacementDevice.retiredAt,
      hasOpenReturnTask: replacementReturnTask,
      hasOpenRegistration: replacementOpen !== null,
    });
    this.assertMayReplace({
      oldDeviceId,
      replacementDeviceId: input.replacementDeviceId,
      oldCustody,
      replacementCustody,
      replacementCondition: replacementDevice.condition,
    });

    const holder = await this.organizationReads.getEmployee(oldOpen!.holderEmployeeId, tx);
    const holderDecision = judgeHolder(holder);
    if (holderDecision === 'NOT_FOUND') throw new DeviceHolderNotFoundError();
    if (holderDecision === 'NOT_WORKING') throw new DeviceHolderNotWorkingError();
    if (judgeSoftwareRemoval({ hasCurrentHolder: true, softwareRemoval: input.softwareRemoval }) === 'NOTE_REQUIRED') {
      throw new DeviceSoftwareRemovalNoteRequiredError();
    }

    return { oldOpen: oldOpen!, removal: normalizeSoftwareRemoval(input.softwareRemoval) };
  }

  private async lockPair(
    tx: DbTx,
    oldDeviceId: string,
    replacementDeviceId: string,
  ): Promise<{
    oldDevice: DeviceRecord;
    replacementDevice: DeviceRecord;
    oldOpen: RegistrationRecord | null;
    replacementOpen: RegistrationRecord | null;
  }> {
    const sortedIds = [oldDeviceId, replacementDeviceId].sort();
    const devices = await this.repo.lockDevices(tx, sortedIds);
    const byId = new Map(devices.map((device) => [device.id, device]));
    const oldDevice = byId.get(oldDeviceId);
    const replacementDevice = byId.get(replacementDeviceId);
    if (!oldDevice || !replacementDevice) throw new DeviceNotFoundError();

    const openByDeviceId = new Map<string, RegistrationRecord | null>();
    for (const id of sortedIds) {
      openByDeviceId.set(id, await this.repo.lockOpenRegistration(tx, id));
    }

    return {
      oldDevice,
      replacementDevice,
      oldOpen: openByDeviceId.get(oldDeviceId) ?? null,
      replacementOpen: openByDeviceId.get(replacementDeviceId) ?? null,
    };
  }

  private assertMayReplace(facts: Parameters<typeof judgeReplace>[0]): void {
    switch (judgeReplace(facts)) {
      case 'OK':
        return;
      case 'SAME_DEVICE':
        throw new DeviceSameDeviceError();
      case 'VOIDED':
        throw new DeviceVoidedError();
      case 'ALREADY_RETIRED':
        throw new DeviceAlreadyRetiredError();
      case 'AWAITING_RETURN':
        throw new DeviceAwaitingReturnError();
      case 'NOT_HELD':
        throw new DeviceNotHeldError();
      case 'REPLACEMENT_NOT_IN_STOCK':
        throw new DeviceReplacementNotInStockError();
      case 'NOT_USABLE':
        throw new DeviceNotUsableError();
    }
  }

  private async validateAndSortMovableActivations(
    tx: DbTx,
    oldDeviceId: string,
    choices: readonly DeviceReplacementActivationChoice[],
  ): Promise<ActivationRecord[]> {
    if (choices.length === 0) return [];
    const open = await this.activations.openOfDevice(oldDeviceId, tx);
    const byId = new Map(open.map((row) => [row.id, row]));

    for (const choice of choices) {
      const row = byId.get(choice.activationId);
      if (!row) throw new DeviceActivationNotOnDeviceError();
      if (row.licenseKeyId === null) throw new DeviceActivationNotMovableError();
    }

    return choices
      .filter((choice) => choice.action === 'MOVE')
      .map((choice) => byId.get(choice.activationId)!)
      .sort((a, b) => (a.subscriptionId ?? '').localeCompare(b.subscriptionId ?? '') || a.id.localeCompare(b.id));
  }

  private async insertReplacementRegistration(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    holderEmployeeId: string,
    validFrom: string,
    input: DeviceReplacementInput,
  ): Promise<void> {
    try {
      await this.repo.insertRegistration(tx, {
        organizationId,
        deviceId: input.replacementDeviceId,
        holderEmployeeId,
        validFrom,
        collectorInstalled: input.collectorInstalled,
        createdByAppUserId: actor.appUserId,
      });
    } catch (error) {
      if (readSqlState(error) === '23P01' || isUniqueViolation(error, 'device_registrations_one_open', 'device_id')) {
        throw new DeviceRegistrationOverlapError();
      }
      throw error;
    }
  }

  private async moveSelectedActivations(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    toMove: readonly ActivationRecord[],
    context: { targetDeviceId: string; on: string; at: Date; bySubstitute: boolean },
  ): Promise<Array<{ activationId: string; overActivationCap: boolean }>> {
    const moved: Array<{ activationId: string; overActivationCap: boolean }> = [];
    for (const row of toMove) {
      const outcome = await this.activations.move(tx, {
        activationId: row.id,
        targetDeviceId: context.targetDeviceId,
        on: context.on,
        at: context.at,
        by: {
          kind: 'USER',
          appUserId: actor.appUserId,
          employeeId: actor.employeeId,
          sessionId: actor.sessionId,
          bySubstitute: context.bySubstitute,
        },
      });
      moved.push({ activationId: row.id, overActivationCap: outcome.overActivationCap });
    }

    return moved;
  }

  private async recordAudit(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    oldDeviceId: string,
    holderEmployeeId: string,
    details: {
      input: DeviceReplacementInput;
      removal: NormalizedSoftwareRemoval;
      movedCount: number;
      bySubstitute: boolean;
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      devicesEvent(byUser(actor), organizationId, 'DEVICE.REPLACED', 'ManagedDevice', oldDeviceId, null, {
        oldDeviceId,
        replacementDeviceId: details.input.replacementDeviceId,
        holderEmployeeId,
        condition: details.input.condition,
        conditionNote: details.input.conditionNote ?? null,
        softwareRemoval: details.removal,
        collectorInstalled: details.input.collectorInstalled,
        movedCount: details.movedCount,
        ...(details.bySubstitute ? { bySubstitute: true } : {}),
      }),
    );
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

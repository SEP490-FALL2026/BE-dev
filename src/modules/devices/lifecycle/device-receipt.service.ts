import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf, type DeviceCondition } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo, type RegistrationRecord } from '../registry/registry.repo';
import {
  DeviceNotHeldError,
  DeviceReturnTaskNotInChargeError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';
import { normalizeSoftwareRemoval, requireLifecycleActor, type NormalizedSoftwareRemoval } from './lifecycle.mapper';
import { judgeReturn, judgeSoftwareRemoval, type SoftwareRemovalInput } from './lifecycle.policy';

export interface DeviceReturnInput {
  condition: DeviceCondition;
  conditionNote?: string | undefined;
  softwareRemoval: SoftwareRemovalInput;
}

/**
 * Receives a held or awaiting-return machine back into stock, ending any open registration and recording its condition.
 *
 * Lock order: machine FOR UPDATE (tier 2b), then open registration FOR UPDATE.
 */
@Injectable()
export class DeviceReceiptService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Returns a held machine to stock and records its condition and software removal confirmation. */
  async returnToStock(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    input: DeviceReturnInput,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);
      const hasOpenReturnTask = await this.repo.hasOpenReturnTask(tx, deviceId);
      const custody = custodyOf({
        voidedAt: device.voidedAt,
        retiredAt: device.retiredAt,
        hasOpenReturnTask,
        hasOpenRegistration: open !== null,
      });
      this.assertMayReturn(custody);

      const removal = this.assertRemovalValid(input.softwareRemoval);
      if (hasOpenReturnTask) {
        // Open return task handling is connected in the return-task module later; reject until task completion is wired.
        throw new DeviceReturnTaskNotInChargeError();
      }

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = open
        ? await requireLifecycleActor(
            tx,
            { organizationReads: this.organizationReads, identity: this.identity },
            {
              actorEmployeeId: actor.employeeId,
              today,
              oldHolderEmployeeId: open.holderEmployeeId,
              recipientEmployeeId: null,
            },
          )
        : false;

      await this.receive(tx, {
        organizationId: organization.id,
        actor,
        deviceId,
        openRegistration: open,
        condition: input.condition,
        conditionNote: input.conditionNote ?? null,
        softwareRemoval: removal,
        now,
        bySubstitute,
        recordAudit: true,
      });
    });
  }

  /** Shared transaction step for return-to-stock, device replacement, and return-task receipt. */
  async receive(
    tx: DbTx,
    input: {
      organizationId: string;
      actor: AuthenticatedPrincipal;
      deviceId: string;
      openRegistration: RegistrationRecord | null;
      condition: DeviceCondition;
      conditionNote: string | null;
      softwareRemoval: NormalizedSoftwareRemoval;
      now: Date;
      bySubstitute?: boolean;
      returnTaskId?: string | null;
      recordAudit?: boolean;
    },
  ): Promise<void> {
    if (input.openRegistration) {
      await this.ending.end(
        tx,
        input.openRegistration,
        { at: input.now, cause: 'RETURNED', softwareRemoval: input.softwareRemoval },
        byUser(input.actor),
      );
    }
    await this.repo.updateCondition(tx, input.deviceId, input.condition, input.conditionNote);

    if (input.recordAudit !== false) {
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(input.actor),
          input.organizationId,
          'DEVICE.RETURNED',
          'ManagedDevice',
          input.deviceId,
          null,
          {
            condition: input.condition,
            conditionNote: input.conditionNote,
            endedRegistrationId: input.openRegistration?.id ?? null,
            softwareRemoval: input.softwareRemoval,
            ...(input.returnTaskId ? { returnTaskId: input.returnTaskId } : {}),
            ...(input.bySubstitute ? { bySubstitute: true } : {}),
          },
        ),
      );
    }
  }

  private assertMayReturn(custody: ReturnType<typeof custodyOf>): void {
    switch (judgeReturn({ custody })) {
      case 'OK':
        return;
      case 'VOIDED':
        throw new DeviceVoidedError();
      case 'ALREADY_RETIRED':
        throw new DeviceAlreadyRetiredError();
      case 'NOT_HELD':
        throw new DeviceNotHeldError();
    }
  }

  private assertRemovalValid(softwareRemoval: SoftwareRemovalInput): NormalizedSoftwareRemoval {
    const verdict = judgeSoftwareRemoval({ hasCurrentHolder: true, softwareRemoval });
    if (verdict === 'NOTE_REQUIRED') throw new DeviceSoftwareRemovalNoteRequiredError();

    return normalizeSoftwareRemoval(softwareRemoval);
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

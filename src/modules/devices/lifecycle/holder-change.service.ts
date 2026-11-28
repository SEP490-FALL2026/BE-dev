import { Injectable } from '@nestjs/common';
import { readSqlState, TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistrationEndService } from '../registry/registration-end.service';
import {
  DeviceAlreadyRetiredError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceHolderUnchangedError,
  DeviceRegistrationOverlapError,
} from '../registry/registry.errors';
import { judgeHolder } from '../registry/registry.policy';
import { RegistryRepo, type RegistrationRecord } from '../registry/registry.repo';
import {
  DeviceAwaitingReturnError,
  DeviceNotUsableError,
  DeviceSoftwareRemovalNoteRequiredError,
  DeviceSoftwareRemovalRequiredError,
  DeviceVoidedError,
} from './lifecycle.errors';
import { normalizeSoftwareRemoval, requireLifecycleActor } from './lifecycle.mapper';
import { judgeGive, judgeSoftwareRemoval, type SoftwareRemovalInput } from './lifecycle.policy';

export interface HolderChangeInput {
  holderEmployeeId: string;
  collectorInstalled: boolean;
  softwareRemoval?: SoftwareRemovalInput | undefined;
}

/**
 * Hands over an in-stock usable machine to an employee or moves an assigned machine from one holder to another.
 *
 * Lock order: recipient employee FOR SHARE (tier 1), machine FOR UPDATE (tier 2b), then open registration FOR UPDATE.
 */
@Injectable()
export class HolderChangeService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Assigns a usable IN_STOCK or ASSIGNED machine to `input.holderEmployeeId`. */
  async changeHolder(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    input: HolderChangeInput,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const holder = await this.readAndLockRecipient(tx, input.holderEmployeeId);
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
      this.assertMayGive(custody, device.condition, open?.holderEmployeeId ?? null, input.holderEmployeeId);

      const validatedHolder = this.requireWorkingHolder(holder);
      const removal = this.assertSoftwareRemoval(open !== null, input.softwareRemoval);
      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await requireLifecycleActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        {
          actorEmployeeId: actor.employeeId,
          today,
          deviceId,
          oldHolderEmployeeId: open?.holderEmployeeId ?? null,
          recipientEmployeeId: validatedHolder.id,
        },
      );

      if (open && removal) {
        await this.ending.end(tx, open, { at: now, cause: 'HOLDER_CHANGED', softwareRemoval: removal }, byUser(actor));
      }
      const registration = await this.insertRegistration(tx, actor, deviceId, validatedHolder.id, today, {
        organizationId: organization.id,
        collectorInstalled: input.collectorInstalled,
      });
      await this.recordAudit(tx, actor, organization.id, deviceId, open, {
        holderEmployeeId: validatedHolder.id,
        registrationId: registration.id,
        validFrom: today,
        collectorInstalled: input.collectorInstalled,
        removal,
        bySubstitute,
      });
    });
  }

  private async readAndLockRecipient(tx: DbTx, employeeId: string) {
    const exists = await this.organizationReads.getEmployee(employeeId, tx);
    if (!exists) return null;
    await this.organizationReads.lockEmployeeForShare(tx, employeeId);

    return this.organizationReads.getEmployee(employeeId, tx);
  }

  private requireWorkingHolder(holder: Awaited<ReturnType<OrganizationReadApi['getEmployee']>>) {
    const decision = judgeHolder(holder);
    if (decision === 'NOT_FOUND' || !holder) throw new DeviceHolderNotFoundError();
    if (decision === 'NOT_WORKING') throw new DeviceHolderNotWorkingError();

    return holder;
  }

  private async recordAudit(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    deviceId: string,
    open: RegistrationRecord | null,
    details: {
      holderEmployeeId: string;
      registrationId: string;
      validFrom: string;
      collectorInstalled: boolean;
      removal: ReturnType<HolderChangeService['assertSoftwareRemoval']>;
      bySubstitute: boolean;
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      devicesEvent(
        byUser(actor),
        organizationId,
        'DEVICE.HOLDER_CHANGED',
        'ManagedDevice',
        deviceId,
        open ? { holderEmployeeId: open.holderEmployeeId } : null,
        {
          holderEmployeeId: details.holderEmployeeId,
          registrationId: details.registrationId,
          validFrom: details.validFrom,
          collectorInstalled: details.collectorInstalled,
          ...(details.removal ? { softwareRemoval: details.removal } : {}),
          ...(details.bySubstitute ? { bySubstitute: true } : {}),
        },
      ),
    );
  }

  private assertMayGive(
    custody: ReturnType<typeof custodyOf>,
    condition: 'USABLE' | 'IN_REPAIR' | 'BROKEN',
    currentHolderEmployeeId: string | null,
    nextHolderEmployeeId: string,
  ): void {
    switch (judgeGive({ custody, condition, currentHolderEmployeeId, nextHolderEmployeeId })) {
      case 'OK':
        return;
      case 'VOIDED':
        throw new DeviceVoidedError();
      case 'ALREADY_RETIRED':
        throw new DeviceAlreadyRetiredError();
      case 'AWAITING_RETURN':
        throw new DeviceAwaitingReturnError();
      case 'NOT_USABLE':
        throw new DeviceNotUsableError();
      case 'HOLDER_UNCHANGED':
        throw new DeviceHolderUnchangedError();
    }
  }

  private assertSoftwareRemoval(hasCurrentHolder: boolean, softwareRemoval?: SoftwareRemovalInput | null) {
    switch (judgeSoftwareRemoval({ hasCurrentHolder, softwareRemoval })) {
      case 'NOT_NEEDED':
        return null;
      case 'REQUIRED':
        throw new DeviceSoftwareRemovalRequiredError();
      case 'NOTE_REQUIRED':
        throw new DeviceSoftwareRemovalNoteRequiredError();
      case 'OK':
        return normalizeSoftwareRemoval(softwareRemoval!);
    }
  }

  private async insertRegistration(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    deviceId: string,
    holderEmployeeId: string,
    validFrom: string,
    options: { organizationId: string; collectorInstalled: boolean },
  ): Promise<RegistrationRecord> {
    try {
      return await this.repo.insertRegistration(tx, {
        organizationId: options.organizationId,
        deviceId,
        holderEmployeeId,
        validFrom,
        collectorInstalled: options.collectorInstalled,
        createdByAppUserId: actor.appUserId,
      });
    } catch (error) {
      if (readSqlState(error) === '23P01' || isUniqueViolation(error, 'device_registrations_one_open', 'device_id')) {
        throw new DeviceRegistrationOverlapError();
      }
      throw error;
    }
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

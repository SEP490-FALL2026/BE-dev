import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo, type RegistrationRecord } from '../registry/registry.repo';
import { DeviceAwaitingReturnError, DeviceVoidedError } from './lifecycle.errors';
import { requireLifecycleActor } from './lifecycle.mapper';
import { judgeRetire } from './lifecycle.policy';

type DeviceActivationDecisionInput = NonNullable<
  Parameters<LicensingDeviceActivationApi['closeAllOfDevice']>[1]['decisions']
>[number];

export interface RetireDeviceInput {
  retirementKind?: 'DISPOSED' | 'LOST' | undefined;
  reason: string;
  activationDecisions?: readonly DeviceActivationDecisionInput[] | undefined;
}

/**
 * Retires a machine from active use (disposed or lost), closing its open registration and device-bound activations.
 *
 * Lock order: machine FOR UPDATE (tier 2b), open registration FOR UPDATE, then licensing activation locks.
 */
@Injectable()
export class RetirementService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly activations: LicensingDeviceActivationApi,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Takes a machine out of use, ending its open registration if held and closing all open software activations. */
  async retire(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    input: RetireDeviceInput,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run((tx) => this.retireInTx(tx, actor, organization.id, deviceId, input, now));
  }

  /** Executes machine retirement inside an existing transaction so callers such as return-task loss may compose it. */
  async retireInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    deviceId: string,
    input: RetireDeviceInput,
    now: Date = new Date(),
    options?: {
      preAuthorized?: { open: RegistrationRecord | null; today: BusinessDate; bySubstitute: boolean };
      returnTaskId?: string | undefined;
    },
  ): Promise<void> {
    const { open, today, bySubstitute } =
      options?.preAuthorized ?? (await this.lockAndAuthorize(tx, actor, deviceId, now));

    if (open) await this.ending.end(tx, open, { at: now, cause: 'DEVICE_RETIRED' }, byUser(actor));
    const kind = input.retirementKind ?? 'DISPOSED';
    const closed = await this.activations.closeAllOfDevice(tx, {
      deviceId,
      cause: kind === 'LOST' ? 'DEVICE_LOST' : 'DEVICE_DISPOSED',
      decisions: input.activationDecisions ?? [],
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
    await this.repo.retireDevice(tx, deviceId, now, input.reason, kind);
    await this.closeUnplacedDesignations(tx, actor.appUserId, deviceId, options?.returnTaskId, now);
    await this.audit.record(
      tx,
      devicesEvent(byUser(actor), organizationId, 'DEVICE.RETIRED', 'ManagedDevice', deviceId, null, {
        reason: input.reason,
        retirementKind: kind,
        endedRegistrationId: open?.id ?? null,
        activationDecisions: closed.map((item) => ({ activationId: item.id, licenseReleased: item.licenseReleased })),
        ...(bySubstitute ? { bySubstitute: true } : {}),
      }),
    );
  }

  private async closeUnplacedDesignations(
    tx: DbTx,
    endedByAppUserId: string,
    deviceId: string,
    returnTaskId: string | undefined,
    endedAt: Date,
  ): Promise<void> {
    if (returnTaskId) {
      await this.organization.endUnplacedWorkDesignations(tx, {
        workKind: 'DEVICE_RETURN_TASK',
        workId: returnTaskId,
        endedByAppUserId,
        endedAt,
      });
    }
    await this.organization.endUnplacedWorkDesignations(tx, {
      workKind: 'DEVICE',
      workId: deviceId,
      endedByAppUserId,
      endedAt,
    });
  }

  private async lockAndAuthorize(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    deviceId: string,
    now: Date,
  ): Promise<{ open: RegistrationRecord | null; today: string; bySubstitute: boolean }> {
    const device = await this.repo.lockDevice(tx, deviceId);
    if (!device) throw new DeviceNotFoundError();
    const open = await this.repo.lockOpenRegistration(tx, deviceId);
    const hasOpenReturnTask = await this.repo.hasOpenReturnTask(tx, deviceId);
    this.assertMayRetire(
      custodyOf({
        voidedAt: device.voidedAt,
        retiredAt: device.retiredAt,
        hasOpenReturnTask,
        hasOpenRegistration: open !== null,
      }),
    );

    const today = await this.organizationReads.businessToday(now, tx);
    const bySubstitute = open
      ? await requireLifecycleActor(
          tx,
          { organizationReads: this.organizationReads, identity: this.identity },
          {
            actorEmployeeId: actor.employeeId,
            today,
            deviceId,
            oldHolderEmployeeId: open.holderEmployeeId,
            recipientEmployeeId: null,
          },
        )
      : false;

    return { open, today, bySubstitute };
  }

  private assertMayRetire(custody: ReturnType<typeof custodyOf>): void {
    switch (judgeRetire({ custody })) {
      case 'OK':
        return;
      case 'VOIDED':
        throw new DeviceVoidedError();
      case 'ALREADY_RETIRED':
        throw new DeviceAlreadyRetiredError();
      case 'AWAITING_RETURN':
        throw new DeviceAwaitingReturnError();
    }
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf, type DeviceCondition } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceConditionUnchangedError, DeviceVoidedError } from './lifecycle.errors';
import { requireDepartmentActor, requireLifecycleActor } from './lifecycle.mapper';
import { judgeConditionChange } from './lifecycle.policy';

export interface ConditionChangeInput {
  condition: DeviceCondition;
  note?: string | undefined;
}

/**
 * Updates the physical condition of a registered machine without changing its holder or open activations.
 *
 * Lock order: machine FOR UPDATE (tier 2b), then open registration FOR UPDATE.
 */
@Injectable()
export class ConditionService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Records a condition change on a non-voided, non-retired machine. */
  async changeCondition(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    input: ConditionChangeInput,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
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
      this.assertMayChangeCondition(custody, device.condition, input.condition);

      const bySubstitute = await this.authorizeChange(tx, actor, deviceId, open, returnTask, now);

      const conditionNote = input.note ?? null;
      await this.repo.updateCondition(tx, deviceId, input.condition, conditionNote);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE.CONDITION_CHANGED',
          'ManagedDevice',
          deviceId,
          { condition: device.condition, conditionNote: device.conditionNote },
          { condition: input.condition, conditionNote, ...(bySubstitute ? { bySubstitute: true } : {}) },
        ),
      );
    });
  }

  private async authorizeChange(
    tx: Parameters<RegistryRepo['lockDevice']>[0],
    actor: AuthenticatedPrincipal,
    deviceId: string,
    open: { holderEmployeeId: string } | null,
    returnTask: { found: boolean; id?: string | null; departmentId: string | null; employeeId?: string | null },
    now: Date,
  ): Promise<boolean> {
    if (returnTask.found) {
      return requireDepartmentActor(
        tx,
        { organizationReads: this.organizationReads, identity: this.identity },
        {
          actorEmployeeId: actor.employeeId,
          departmentId: returnTask.departmentId,
          returnTaskId: returnTask.id,
          returnTaskEmployeeId: returnTask.employeeId,
        },
      );
    }
    if (!open) return false;
    const today = await this.organizationReads.businessToday(now, tx);

    return requireLifecycleActor(
      tx,
      { organizationReads: this.organizationReads, identity: this.identity },
      {
        actorEmployeeId: actor.employeeId,
        today,
        deviceId,
        oldHolderEmployeeId: open.holderEmployeeId,
        recipientEmployeeId: null,
      },
    );
  }

  private assertMayChangeCondition(
    custody: ReturnType<typeof custodyOf>,
    currentCondition: DeviceCondition,
    nextCondition: DeviceCondition,
  ): void {
    switch (judgeConditionChange({ custody, currentCondition, nextCondition })) {
      case 'OK':
        return;
      case 'VOIDED':
        throw new DeviceVoidedError();
      case 'ALREADY_RETIRED':
        throw new DeviceAlreadyRetiredError();
      case 'CONDITION_UNCHANGED':
        throw new DeviceConditionUnchangedError();
    }
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

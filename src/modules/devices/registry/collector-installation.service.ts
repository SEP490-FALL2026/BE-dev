import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { excludeDepartmentActor, judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceCollectorAlreadyInstalledError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
} from './registry.errors';
import { judgeHolder } from './registry.policy';
import { RegistryRepo } from './registry.repo';

/**
 * Enables collector installation on an existing open device registration (one-way transition from false to true).
 *
 * Lock order: holder employee FOR SHARE (tier 1), machine FOR UPDATE (tier 2b), then registration FOR UPDATE.
 */
@Injectable()
export class CollectorInstallationService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Marks an open registration as having a collector installed and returns its device id. */
  async enable(actor: AuthenticatedPrincipal, registrationId: string, now: Date = new Date()): Promise<string> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const initial = await this.repo.findRegistration(registrationId, tx);
      if (!initial) throw new DeviceRegistrationNotFoundError();
      await this.organizationReads.lockEmployeeForShare(tx, initial.holderEmployeeId);

      const registration = await this.repo.lockRegistrationChain(tx, registrationId);
      if (!registration) throw new DeviceRegistrationNotFoundError();
      if (registration.endedAt) throw new DeviceRegistrationEndedError();
      if (registration.collectorInstalled) throw new DeviceCollectorAlreadyInstalledError();

      const holder = await this.organizationReads.getEmployee(registration.holderEmployeeId, tx);
      if (judgeHolder(holder) !== 'OK') throw new DeviceHolderNotWorkingError();

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await this.requireActingItAdmin(
        tx,
        registration.deviceId,
        registration.holderEmployeeId,
        actor.employeeId,
        today,
      );

      await this.repo.enableCollector(tx, registration.id);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_REGISTRATION.COLLECTOR_ENABLED',
          'DeviceRegistration',
          registration.id,
          null,
          {
            deviceId: registration.deviceId,
            collectorInstalled: true,
            ...(bySubstitute ? { bySubstitute: true } : {}),
          },
        ),
      );

      return registration.deviceId;
    });
  }

  private async requireActingItAdmin(
    tx: Parameters<RegistryRepo['lockRegistrationChain']>[0],
    deviceId: string,
    holderEmployeeId: string,
    actorEmployeeId: string,
    today: string,
  ): Promise<boolean> {
    const returnTask = await this.repo.findOpenReturnTaskDepartmentId(tx, deviceId);
    if (returnTask.found) {
      return this.requireReturnTaskActingItAdmin(tx, {
        actorEmployeeId,
        departmentId: returnTask.departmentId,
        returnTaskId: returnTask.id ?? null,
        returnTaskEmployeeId: returnTask.employeeId ?? null,
        today,
      });
    }

    const departmentId =
      (await this.organizationReads.workDepartmentsOf([holderEmployeeId], today, tx)).get(holderEmployeeId) ?? null;
    if (!departmentId) {
      return this.requireUnplacedActingItAdmin(tx, {
        workKind: 'DEVICE',
        workId: deviceId,
        employeeId: holderEmployeeId,
        actorEmployeeId,
        today,
      });
    }

    return this.requireDepartmentActingItAdmin(tx, departmentId, actorEmployeeId);
  }

  private async requireReturnTaskActingItAdmin(
    tx: Parameters<RegistryRepo['lockRegistrationChain']>[0],
    input: {
      actorEmployeeId: string;
      departmentId: string | null;
      returnTaskId: string | null;
      returnTaskEmployeeId: string | null;
      today: string;
    },
  ): Promise<boolean> {
    if (input.returnTaskEmployeeId && input.actorEmployeeId === input.returnTaskEmployeeId) {
      throw new DeviceNotInChargeError();
    }
    if (!input.departmentId) {
      return this.requireUnplacedActingItAdmin(tx, {
        workKind: 'DEVICE_RETURN_TASK',
        workId: input.returnTaskId,
        employeeId: input.returnTaskEmployeeId,
        actorEmployeeId: input.actorEmployeeId,
        today: input.today,
      });
    }

    return this.requireDepartmentActingItAdmin(
      tx,
      input.departmentId,
      input.actorEmployeeId,
      input.returnTaskEmployeeId,
    );
  }

  private async requireUnplacedActingItAdmin(
    tx: Parameters<RegistryRepo['lockRegistrationChain']>[0],
    input: {
      workKind: 'DEVICE' | 'DEVICE_RETURN_TASK';
      workId: string | null;
      employeeId: string | null;
      actorEmployeeId: string;
      today: string;
    },
  ): Promise<boolean> {
    if (input.employeeId) {
      if ((await this.organizationReads.notStartedAmong([input.employeeId], input.today, tx)).has(input.employeeId)) {
        throw new EmployeeNotStartedError(input.employeeId);
      }
    }
    let unplacedDesignee: string | null = null;
    if (input.workId && input.employeeId) {
      const resolved = await this.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: input.workKind, workId: input.workId, employeeId: input.employeeId }],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      );
      unplacedDesignee = resolved.get(unplacedWorkKey(input.workKind, input.workId)) ?? null;
    }
    const verdict = judgeDeviceActor({
      holderDepartmentId: null,
      recipientDepartmentId: null,
      actingByDepartment: new Map(),
      actor: input.actorEmployeeId,
      unplacedRequired: true,
      unplacedDesignee,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  private async requireDepartmentActingItAdmin(
    tx: Parameters<RegistryRepo['lockRegistrationChain']>[0],
    departmentId: string,
    actorEmployeeId: string,
    excludedEmployeeId?: string | null,
  ): Promise<boolean> {
    const actingByDepartment = await this.organizationReads.itAdminsActingFor(
      [departmentId],
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const verdict = judgeDeviceActor({
      holderDepartmentId: departmentId,
      recipientDepartmentId: null,
      actingByDepartment: excludeDepartmentActor(actingByDepartment, departmentId, excludedEmployeeId),
      actor: actorEmployeeId,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}

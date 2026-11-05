import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { devicesEvent, type DevicesActor } from '../devices-audit-event.mapper';
import { CredentialRevocationService } from '../credential/credential-revocation.service';
import type { DeviceRegistrationEndCause } from '../public/devices.types';
import { validUntilOf } from './registry.policy';
import { RegistryRepo, type RegistrationRecord } from './registry.repo';

/**
 * The one place a registration ends (`US-09-01` AC-10, `US-09-08`): a new holder, a retired machine, the person who left.
 * It never reopens one. Whoever calls it holds the lock of the machine and of the registration already.
 */
@Injectable()
export class RegistrationEndService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly credentials: CredentialRevocationService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Ends a registration the caller has locked; the days it covered stop at the day it ended in the zone of the organization. */
  async end(
    tx: DbTx,
    registration: RegistrationRecord,
    input: { at: Date; cause: DeviceRegistrationEndCause },
    by: DevicesActor,
  ): Promise<void> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A registration was ended before installation');
    const validUntil = validUntilOf(registration.validFrom, input.at, organization.timeZone);
    await this.repo.endRegistration(tx, registration.id, { endedAt: input.at, validUntil, cause: input.cause });
    await this.audit.record(
      tx,
      devicesEvent(
        by,
        organization.id,
        'DEVICE_REGISTRATION.ENDED',
        'DeviceRegistration',
        registration.id,
        {
          deviceId: registration.deviceId,
          holderEmployeeId: registration.holderEmployeeId,
          validFrom: registration.validFrom,
        },
        { validUntil, endedAt: input.at.toISOString(), endCause: input.cause },
      ),
    );
    // Every credential of the registration ends with it, at the same instant (`US-09-08` AC-5).
    await this.credentials.revokeAllOfRegistration(
      tx,
      { organizationId: organization.id, registrationId: registration.id, at: input.at },
      by,
    );
  }

  /**
   * Ends every open registration of a person, the machines locked first; asking again changes nothing. Returns the ids it ended.
   * The system is the actor: nobody pressed a button.
   */
  async endForHolder(
    tx: DbTx,
    input: { employeeId: string; at: Date; cause: DeviceRegistrationEndCause },
  ): Promise<string[]> {
    const open = await this.repo.lockOpenRegistrationsOfHolder(tx, input.employeeId);
    for (const registration of open) {
      await this.end(tx, registration, input, { kind: 'SYSTEM', correlationId: registration.id });
    }

    return open.map((registration) => registration.id);
  }
}

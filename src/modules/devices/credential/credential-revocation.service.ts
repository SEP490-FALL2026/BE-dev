import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent, type DevicesActor } from '../devices-audit-event.mapper';
import { DeviceCredentialAlreadyRevokedError, DeviceCredentialNotFoundError } from './credential.errors';
import { CredentialRepo, type CredentialRow } from './credential.repo';

/**
 * Takes away every credential of a registration the moment it ends (`US-09-08` AC-5): the time of the revocation is the time the
 * registration ended. Nothing brings a credential back; a new registration needs a new code. The caller holds the lock of the
 * registration already; the credentials are locked in id order.
 */
@Injectable()
export class CredentialRevocationService {
  constructor(
    private readonly repo: CredentialRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Returns how many credentials were revoked; asking again revokes none. */
  async revokeAllOfRegistration(
    tx: DbTx,
    input: { organizationId: string; registrationId: string; at: Date },
    by: DevicesActor,
  ): Promise<number> {
    const revoked = await this.repo.revokeAllOfRegistration(tx, input.registrationId, input.at);
    for (const credential of revoked) {
      await this.audit.record(
        tx,
        devicesEvent(by, input.organizationId, 'DEVICE_CREDENTIAL.REVOKED', 'DeviceCredential', credential.id, null, {
          collectorKind: credential.collectorKind,
          revokedAt: input.at.toISOString(),
          revocationCause: 'REGISTRATION_ENDED',
        }),
      );
    }

    return revoked.length;
  }

  /**
   * The IT Admin takes a credential away at once, with the reason (`US-09-01` AC-13): the very next request of the tool is a 401.
   * Throws DeviceCredentialNotFoundError and DeviceCredentialAlreadyRevokedError.
   */
  async revokeByIt(
    actor: AuthenticatedPrincipal,
    credentialId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<CredentialRow> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A credential was revoked before installation');

    return this.runner.run(async (tx) => {
      const registrationId = await this.repo.registrationIdOfCredential(credentialId, tx);
      if (!registrationId) throw new DeviceCredentialNotFoundError();
      // The registration first, in the order the register takes its locks, so this never waits on an ending in a circle.
      await this.repo.lockRegistrationForCode(tx, registrationId);
      const row = await this.repo.lockCredential(tx, credentialId);
      if (!row) throw new DeviceCredentialNotFoundError();
      if (row.revokedAt) throw new DeviceCredentialAlreadyRevokedError();
      await this.repo.revokeByIt(tx, credentialId, { at: now, reason, byAppUserId: actor.appUserId });
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_CREDENTIAL.REVOKED',
          'DeviceCredential',
          credentialId,
          null,
          {
            collectorKind: row.collectorKind,
            revokedAt: now.toISOString(),
            revocationCause: 'IT_ADMIN',
          },
        ),
      );

      return (await this.repo.findCredential(credentialId, tx)) ?? row;
    });
  }
}

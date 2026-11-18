import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import { extractBearerToken } from '../../../../infrastructure/security/tokens/bearer-token';
import { parseDeviceToken } from '../../../../infrastructure/security/tokens/device-token';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { devicesEvent } from '../../devices-audit-event.mapper';
import { DeviceCredentialRevokedError } from '../../public/devices.errors';
import type { DeviceIntakeContext } from '../../public/devices.types';
import { DeviceCredentialExpiredError, DeviceCredentialInvalidError } from '../credential.errors';
import { CREDENTIAL_TTL_MS, generateSecret, matchSecret, rotationPlan, sha256Hex, tokenOf } from '../credential.policy';
import { CredentialRepo, type IntakeFacts } from '../credential.repo';
import { CollectorAllowlistHook } from '../../public/devices.extension-points';
import { sessionWindowOf } from './credential-session.policy';

/**
 * What a collector reads of its own credential: whether it may send data now and from when, and a fresh secret before the old one
 * expires. The intake of data reads the same window through `intakeContext`, so the two cannot disagree.
 */
@Injectable()
export class CredentialSessionService {
  constructor(
    private readonly repo: CredentialRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly allowlist: CollectorAllowlistHook,
  ) {}

  /** Throws DeviceCredentialRevokedError when the credential or the registration it is bound to is gone. */
  async session(credentialId: string, now: Date = new Date()) {
    const facts = await this.repo.intakeFacts(credentialId);
    if (!facts || isGone(facts)) throw new DeviceCredentialRevokedError();
    const [credential, organization] = await Promise.all([
      this.repo.findCredential(credentialId),
      this.organizationReads.getOrganization(),
    ]);
    if (!credential || !organization) throw new DeviceCredentialRevokedError();

    const allowlist = await this.allowlist.get().currentAllowlist(facts.organizationId);

    return {
      ...sessionWindowOf(facts, now),
      expiresAt: credential.expiresAt,
      timezone: organization.timeZone,
      allowlist,
    };
  }

  /**
   * Gives the credential a new secret, valid for another ninety days; the one it replaces works for a day more, until the new one is
   * used (the answer can be lost on the way). Throws DeviceCredentialRevokedError, DeviceCredentialInvalidError and
   * DeviceCredentialExpiredError when, under the lock, the credential is no longer what the guard saw.
   */
  async rotate(
    credentialId: string,
    authorization: string | undefined,
    now: Date = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const secret = parseDeviceToken(extractBearerToken(authorization) ?? '')?.secret;
    const organization = await this.organizationReads.getOrganization();
    if (!secret || !organization) throw new DeviceCredentialInvalidError();

    return this.runner.run(async (tx) => {
      const registrationId = await this.repo.registrationIdOfCredential(credentialId, tx);
      if (!registrationId) throw new DeviceCredentialRevokedError();
      await this.repo.lockRegistrationForCode(tx, registrationId);
      const row = await this.repo.lockCredential(tx, credentialId);
      if (!row || row.revokedAt) throw new DeviceCredentialRevokedError();
      const match = matchSecret(row, secret, now);
      if (match === 'NONE') throw new DeviceCredentialInvalidError();
      if (now >= row.expiresAt) throw new DeviceCredentialExpiredError();
      const next = generateSecret();
      const expiresAt = new Date(now.getTime() + CREDENTIAL_TTL_MS);
      const plan = rotationPlan(
        {
          match,
          currentSecretHash: row.secretHash,
          previousSecretHash: row.previousSecretHash,
          previousValidUntil: row.previousValidUntil,
        },
        now,
      );
      await this.repo.rotate(tx, credentialId, { secretHash: sha256Hex(next), ...plan, expiresAt });
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'DEVICE', credentialId },
          organization.id,
          'DEVICE_CREDENTIAL.ROTATED',
          'DeviceCredential',
          credentialId,
          null,
          { expiresAt: expiresAt.toISOString() },
        ),
      );

      return { token: tokenOf(credentialId, next), expiresAt };
    });
  }

  /**
   * What a decision on data needs of the machine behind a credential, with its registration locked `FOR SHARE` for the rest of the
   * transaction. Throws DeviceCredentialRevokedError when the credential was revoked or its registration ended meanwhile.
   */
  async intakeContext(tx: DbTx, credentialId: string, now: Date = new Date()): Promise<DeviceIntakeContext> {
    const facts = await this.repo.lockIntakeFacts(tx, credentialId);
    if (!facts || isGone(facts)) throw new DeviceCredentialRevokedError();
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new DeviceCredentialRevokedError();
    const window = sessionWindowOf(facts, now);
    const names = window.state === 'ACTIVE' ? await this.repo.noticeIncludesToolStatus(facts.organizationId, tx) : null;

    return {
      organizationId: facts.organizationId,
      deviceId: facts.deviceId,
      registrationId: facts.registrationId,
      credentialId,
      ...window,
      toolStatusAcknowledged: names === true,
      timeZone: organization.timeZone,
    };
  }

  async recordAccepted(tx: DbTx, credentialId: string, at: Date): Promise<void> {
    await this.repo.recordAccepted(tx, credentialId, at);
  }
}

const isGone = (facts: IntakeFacts): boolean =>
  facts.credentialRevokedAt !== null || facts.registrationEndedAt !== null || facts.deviceRetiredAt !== null;

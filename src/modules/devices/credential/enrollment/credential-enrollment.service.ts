import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DeviceCollectorKindName } from '../../../../infrastructure/security/tokens/device-credential-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../../devices-audit-event.mapper';
import {
  CredentialRegistrationEndedError,
  CredentialRegistrationNotFoundError,
  CredentialSignatureRecordMissingError,
  DeviceEnrollmentCodeInvalidError,
} from '../credential.errors';
import {
  CREDENTIAL_TTL_MS,
  ENROLLMENT_CODE_TTL_MS,
  displayEnrollmentCode,
  generateEnrollmentCode,
  generateSecret,
  normalizeEnrollmentCode,
  sha256Hex,
  tokenOf,
} from '../credential.policy';
import { CredentialRepo, type EnrollmentCodeRow } from '../credential.repo';

export interface CreatedEnrollmentCode {
  code: string;
  collectorKind: DeviceCollectorKindName;
  maxUses: number;
  expiresAt: Date;
}

/**
 * The code an IT Admin hands to the person who installs a collector, and the exchange of that code for a credential (`US-09-01` AC-13).
 * Only the hash of the code and of the secret is kept. The exchange is safe to repeat: the same `Idempotency-Key` gets a credential
 * again as long as the tool never received the first answer.
 */
@Injectable()
export class CredentialEnrollmentService {
  constructor(
    private readonly repo: CredentialRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * A code for an open registration whose signed `BM-06` is kept. Throws CredentialRegistrationNotFoundError,
   * CredentialRegistrationEndedError and CredentialSignatureRecordMissingError.
   */
  async createCode(
    actor: AuthenticatedPrincipal,
    registrationId: string,
    input: { collectorKind: DeviceCollectorKindName; maxUses?: number | undefined },
    now: Date = new Date(),
  ): Promise<CreatedEnrollmentCode> {
    const maxUses = input.maxUses ?? 1;
    const expiresAt = new Date(now.getTime() + ENROLLMENT_CODE_TTL_MS);
    const code = generateEnrollmentCode();

    await this.runner.run(async (tx) => {
      const registration = await this.repo.lockRegistrationForCode(tx, registrationId);
      if (!registration) throw new CredentialRegistrationNotFoundError();
      if (registration.endedAt) throw new CredentialRegistrationEndedError();
      if (!registration.signatureRecorded) throw new CredentialSignatureRecordMissingError();
      await this.repo.insertCode(tx, {
        organizationId: registration.organizationId,
        registrationId,
        collectorKind: input.collectorKind,
        codeHash: sha256Hex(code),
        maxUses,
        expiresAt,
        createdByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          registration.organizationId,
          'DEVICE_ENROLLMENT_CODE.CREATED',
          'DeviceRegistration',
          registrationId,
          null,
          { collectorKind: input.collectorKind, maxUses, expiresAt: expiresAt.toISOString() },
        ),
      );
    });

    return { code: displayEnrollmentCode(code), collectorKind: input.collectorKind, maxUses, expiresAt };
  }

  /**
   * Exchanges a code for a credential. Throws DeviceEnrollmentCodeInvalidError for a code that cannot be used for any reason: the
   * answer never says which.
   */
  async enroll(
    input: { enrollmentCode: string; idempotencyKey: string },
    now: Date = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const normalized = normalizeEnrollmentCode(input.enrollmentCode);
    if (!normalized) throw new DeviceEnrollmentCodeInvalidError();
    const codeHash = sha256Hex(normalized);
    const keyHash = sha256Hex(input.idempotencyKey);

    return this.runner.run(async (tx) => {
      const code = await this.repo.lockCodeByHash(tx, codeHash);
      if (!code || now >= code.expiresAt) throw new DeviceEnrollmentCodeInvalidError();
      const issued = await this.issue(tx, code, keyHash, now);
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'DEVICE', credentialId: issued.credentialId },
          code.organizationId,
          'DEVICE_CREDENTIAL.ISSUED',
          'DeviceCredential',
          issued.credentialId,
          null,
          {
            collectorKind: code.collectorKind,
            registrationId: code.registrationId,
            expiresAt: issued.expiresAt.toISOString(),
          },
        ),
      );

      return { token: tokenOf(issued.credentialId, issued.secret), expiresAt: issued.expiresAt };
    });
  }

  /** A new credential for a use of the code, or — for a key already used whose answer the tool never got — a new secret for the same one. */
  private async issue(
    tx: Parameters<CredentialRepo['insertCredential']>[0],
    code: EnrollmentCodeRow,
    keyHash: string,
    now: Date,
  ): Promise<{ credentialId: string; secret: string; expiresAt: Date }> {
    const secret = generateSecret();
    const expiresAt = new Date(now.getTime() + CREDENTIAL_TTL_MS);
    const earlier = await this.repo.findCredentialOfUse(tx, code.id, keyHash);
    if (earlier) {
      // Once the tool has used what it received, or the credential was revoked, the key does not hand it out again.
      if (earlier.revokedAt || earlier.secretUsedAt) throw new DeviceEnrollmentCodeInvalidError();
      await this.repo.replaceUnusedSecret(tx, earlier.id, sha256Hex(secret), expiresAt);

      return { credentialId: earlier.id, secret, expiresAt };
    }
    if (!(await this.repo.consumeUse(tx, code.id, now))) throw new DeviceEnrollmentCodeInvalidError();
    const credential = await this.repo.insertCredential(tx, {
      organizationId: code.organizationId,
      registrationId: code.registrationId,
      deviceId: code.deviceId,
      collectorKind: code.collectorKind,
      secretHash: sha256Hex(secret),
      issuedAt: now,
      expiresAt,
    });
    await this.repo.insertUse(tx, { codeId: code.id, idempotencyKeyHash: keyHash, credentialId: credential.id });
    // One live AI collector for each registration: the tool that enrols again (a re-install, a second code) takes the old one's place.
    // Browsers are not replaced: one extension credential for each browser profile on the machine is expected.
    const replaced =
      code.collectorKind === 'AI_COLLECTOR'
        ? await this.repo.revokeReplaced(tx, {
            registrationId: code.registrationId,
            collectorKind: code.collectorKind,
            keepId: credential.id,
            at: now,
          })
        : [];
    for (const id of replaced) {
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'DEVICE', credentialId: credential.id },
          code.organizationId,
          'DEVICE_CREDENTIAL.REVOKED',
          'DeviceCredential',
          id,
          null,
          { collectorKind: code.collectorKind, revokedAt: now.toISOString(), revocationCause: 'REPLACED' },
        ),
      );
    }

    return { credentialId: credential.id, secret, expiresAt };
  }
}

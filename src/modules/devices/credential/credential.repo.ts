import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DeviceCollectorKindName } from '../../../infrastructure/security/tokens/device-credential-verifier.port';

export interface CredentialForVerification {
  id: string;
  collectorKind: DeviceCollectorKindName;
  secretHash: string;
  secretUsedAt: Date | null;
  previousSecretHash: string | null;
  previousValidUntil: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  registrationEndedAt: Date | null;
  deviceRetiredAt: Date | null;
  holderEmployeeId: string;
}

/** A code with the open registration it was made for, locked. */
export interface EnrollmentCodeRow {
  id: string;
  expiresAt: Date;
  organizationId: string;
  registrationId: string;
  deviceId: string;
  collectorKind: DeviceCollectorKindName;
}

export interface CredentialRow {
  id: string;
  organizationId: string;
  registrationId: string;
  deviceId: string;
  collectorKind: DeviceCollectorKindName;
  secretHash: string;
  secretUsedAt: Date | null;
  previousSecretHash: string | null;
  previousValidUntil: Date | null;
  issuedAt: Date;
  expiresAt: Date;
  lastAcceptedAt: Date | null;
  revokedAt: Date | null;
  revocationCause: 'IT_ADMIN' | 'REGISTRATION_ENDED' | 'REPLACED' | null;
  revocationReason: string | null;
}

/** What the intake of data needs of a credential: the registration it is bound to, locked `FOR SHARE`, and the notice in force. */
export interface IntakeFacts {
  organizationId: string;
  deviceId: string;
  registrationId: string;
  registrationEndedAt: Date | null;
  deviceRetiredAt: Date | null;
  credentialRevokedAt: Date | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
}

const INTAKE_SQL = Prisma.sql`SELECT c.organization_id AS "organizationId", c.device_id AS "deviceId", c.registration_id AS "registrationId",
       r.ended_at AS "registrationEndedAt", d.retired_at AS "deviceRetiredAt", c.revoked_at AS "credentialRevokedAt",
       r.acknowledged_from AS "acknowledgedFrom", r.collection_stopped_at AS "collectionStoppedAt"
  FROM device_credentials c
  JOIN device_registrations r ON r.id = c.registration_id
  JOIN managed_devices d ON d.id = c.device_id
 WHERE c.id =`;

const CREDENTIAL_SELECT = {
  id: true,
  organizationId: true,
  registrationId: true,
  deviceId: true,
  collectorKind: true,
  secretHash: true,
  secretUsedAt: true,
  previousSecretHash: true,
  previousValidUntil: true,
  issuedAt: true,
  expiresAt: true,
  lastAcceptedAt: true,
  revokedAt: true,
  revocationCause: true,
  revocationReason: true,
} as const;

/**
 * Every SQL statement of the codes, the credentials and what they were exchanged for. Only the hash of a code and of a secret is kept.
 * Locks, always in this order: the registration (the register's), then the code or the credential, in id order.
 */
@Injectable()
export class CredentialRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findForVerification(credentialId: string): Promise<CredentialForVerification | null> {
    const rows = await this.prisma.$queryRaw<CredentialForVerification[]>`
      SELECT c.id, c.collector_kind AS "collectorKind", c.secret_hash AS "secretHash", c.secret_used_at AS "secretUsedAt",
             c.previous_secret_hash AS "previousSecretHash", c.previous_valid_until AS "previousValidUntil",
             c.expires_at AS "expiresAt", c.revoked_at AS "revokedAt", r.ended_at AS "registrationEndedAt",
             d.retired_at AS "deviceRetiredAt", r.holder_employee_id AS "holderEmployeeId"
        FROM device_credentials c
        JOIN device_registrations r ON r.id = c.registration_id
        JOIN managed_devices d ON d.id = c.device_id
       WHERE c.id = ${credentialId}::uuid`;

    return rows[0] ?? null;
  }

  /** The first time the current secret is used, the one before it stops working. */
  /** The first use of the current secret; `secretHash` is the one that was just checked, so a rotation that ran meanwhile is not marked used. */
  async markSecretUsed(credentialId: string, secretHash: string, at: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE device_credentials
         SET secret_used_at = ${at}, previous_secret_hash = NULL, previous_valid_until = NULL
       WHERE id = ${credentialId}::uuid AND secret_hash = ${secretHash} AND secret_used_at IS NULL AND revoked_at IS NULL`;
  }

  async insertCode(
    tx: DbTx,
    input: {
      organizationId: string;
      registrationId: string;
      collectorKind: DeviceCollectorKindName;
      codeHash: string;
      maxUses: number;
      expiresAt: Date;
      createdByAppUserId: string;
    },
  ): Promise<void> {
    await tx.deviceEnrollmentCode.create({ data: input });
  }

  /** The code, found by its hash with the open registration of a machine in use, and locked; null for anything else. */
  async lockCodeByHash(tx: DbTx, codeHash: string): Promise<EnrollmentCodeRow | null> {
    const rows = await tx.$queryRaw<EnrollmentCodeRow[]>`
      SELECT c.id, c.expires_at AS "expiresAt", c.organization_id AS "organizationId", c.registration_id AS "registrationId",
             r.device_id AS "deviceId", c.collector_kind AS "collectorKind"
        FROM device_enrollment_codes c
        JOIN device_registrations r ON r.id = c.registration_id AND r.ended_at IS NULL
        JOIN managed_devices d ON d.id = r.device_id AND d.retired_at IS NULL
       WHERE c.code_hash = ${codeHash}
         FOR UPDATE OF c`;

    return rows[0] ?? null;
  }

  /** One more use of a code that has one left and has not expired; false when it does not. */
  async consumeUse(tx: DbTx, codeId: string, now: Date): Promise<boolean> {
    const changed = await tx.$executeRaw`
      UPDATE device_enrollment_codes SET uses = uses + 1
       WHERE id = ${codeId}::uuid AND uses < max_uses AND expires_at > ${now}`;

    return changed === 1;
  }

  /** The credential an `Idempotency-Key` produced for this code, if the key was used. */
  async findCredentialOfUse(tx: DbTx, codeId: string, keyHash: string): Promise<CredentialRow | null> {
    const use = await tx.deviceEnrollmentUse.findUnique({
      where: { codeId_idempotencyKeyHash: { codeId, idempotencyKeyHash: keyHash } },
      select: { credentialId: true },
    });
    if (!use) return null;

    return tx.deviceCredential.findUnique({ where: { id: use.credentialId }, select: CREDENTIAL_SELECT });
  }

  async insertCredential(
    tx: DbTx,
    input: {
      organizationId: string;
      registrationId: string;
      deviceId: string;
      collectorKind: DeviceCollectorKindName;
      secretHash: string;
      issuedAt: Date;
      expiresAt: Date;
    },
  ): Promise<CredentialRow> {
    return tx.deviceCredential.create({ data: input, select: CREDENTIAL_SELECT });
  }

  async insertUse(
    tx: DbTx,
    input: { codeId: string; idempotencyKeyHash: string; credentialId: string },
  ): Promise<void> {
    await tx.deviceEnrollmentUse.create({ data: input });
  }

  /** A new secret for a credential that was never used: the first one is replaced and costs no use of the code. */
  async replaceUnusedSecret(tx: DbTx, credentialId: string, secretHash: string, expiresAt: Date): Promise<void> {
    await tx.deviceCredential.update({ where: { id: credentialId }, data: { secretHash, expiresAt } });
  }

  /** The credential locked `FOR UPDATE` until the transaction ends, or null. */
  async lockCredential(tx: DbTx, credentialId: string): Promise<CredentialRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_credentials WHERE id = ${credentialId}::uuid FOR UPDATE`;

    return locked[0]
      ? tx.deviceCredential.findUnique({ where: { id: credentialId }, select: CREDENTIAL_SELECT })
      : null;
  }

  async rotate(
    tx: DbTx,
    credentialId: string,
    next: {
      secretHash: string;
      previousSecretHash: string | null;
      previousValidUntil: Date | null;
      expiresAt: Date;
    },
  ): Promise<void> {
    await tx.deviceCredential.update({
      where: { id: credentialId },
      data: {
        secretHash: next.secretHash,
        secretUsedAt: null,
        previousSecretHash: next.previousSecretHash,
        previousValidUntil: next.previousValidUntil,
        expiresAt: next.expiresAt,
      },
    });
  }

  findCredential(credentialId: string, tx?: DbTx): Promise<CredentialRow | null> {
    return (tx ?? this.prisma).deviceCredential.findUnique({ where: { id: credentialId }, select: CREDENTIAL_SELECT });
  }

  /** The credentials of a registration, newest first, with the total of the same snapshot. */
  async pageOfRegistration(
    registrationId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: CredentialRow[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.deviceCredential.findMany({
          where: { registrationId },
          orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
          select: CREDENTIAL_SELECT,
        }),
        total: await tx.deviceCredential.count({ where: { registrationId } }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async registrationExists(registrationId: string, tx?: DbTx): Promise<boolean> {
    return (await (tx ?? this.prisma).deviceRegistration.count({ where: { id: registrationId }, take: 1 })) > 0;
  }

  /** The registration of a credential (any state), for the lock order: the registration first. */
  async registrationIdOfCredential(credentialId: string, tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).deviceCredential.findUnique({
      where: { id: credentialId },
      select: { registrationId: true },
    });

    return row?.registrationId ?? null;
  }

  async revokeByIt(
    tx: DbTx,
    credentialId: string,
    input: { at: Date; reason: string; byAppUserId: string },
  ): Promise<void> {
    await tx.deviceCredential.update({
      where: { id: credentialId },
      data: {
        revokedAt: input.at,
        revocationCause: 'IT_ADMIN',
        revocationReason: input.reason,
        revokedByAppUserId: input.byAppUserId,
      },
    });
  }

  /** Takes away the credentials of this kind a registration still has in force, except the one just issued; returns their ids. */
  async revokeReplaced(
    tx: DbTx,
    input: { registrationId: string; collectorKind: DeviceCollectorKindName; keepId: string; at: Date },
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE device_credentials SET revoked_at = ${input.at}, revocation_cause = 'REPLACED'
       WHERE registration_id = ${input.registrationId}::uuid AND collector_kind = ${input.collectorKind}::"DeviceCollectorKind"
         AND revoked_at IS NULL AND id <> ${input.keepId}::uuid
      RETURNING id`;

    return rows.map((row) => row.id).sort();
  }

  /** Revokes every credential of a registration that is still in force, in id order; returns what it revoked. */
  async revokeAllOfRegistration(
    tx: DbTx,
    registrationId: string,
    at: Date,
  ): Promise<{ id: string; collectorKind: string }[]> {
    const open = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_credentials WHERE registration_id = ${registrationId}::uuid AND revoked_at IS NULL
       ORDER BY id FOR UPDATE`;
    if (open.length === 0) return [];
    const ids = open.map((row) => row.id);
    await tx.$executeRaw`
      UPDATE device_credentials SET revoked_at = ${at}, revocation_cause = 'REGISTRATION_ENDED'
       WHERE id = ANY(${ids}::uuid[])`;

    return tx.deviceCredential.findMany({
      where: { id: { in: ids } },
      select: { id: true, collectorKind: true },
      orderBy: { id: 'asc' },
    });
  }

  /** The facts of a credential's registration, read without a lock (the session shows them). */
  async intakeFacts(credentialId: string): Promise<IntakeFacts | null> {
    const rows = await this.prisma.$queryRaw<IntakeFacts[]>(Prisma.sql`${INTAKE_SQL} ${credentialId}::uuid`);

    return rows[0] ?? null;
  }

  /** The same facts with the registration locked `FOR SHARE` until the transaction ends: a decision on data cannot race an ending. */
  async lockIntakeFacts(tx: DbTx, credentialId: string): Promise<IntakeFacts | null> {
    const rows = await tx.$queryRaw<IntakeFacts[]>(Prisma.sql`${INTAKE_SQL} ${credentialId}::uuid FOR SHARE OF r`);

    return rows[0] ?? null;
  }

  /** The registration a code is made for, locked `FOR SHARE`: whether it is open and whether its signed `BM-06` is kept. */
  async lockRegistrationForCode(
    tx: DbTx,
    registrationId: string,
  ): Promise<{ organizationId: string; endedAt: Date | null; signatureRecorded: boolean } | null> {
    const rows = await tx.$queryRaw<{ organizationId: string; endedAt: Date | null; signatureRecorded: boolean }[]>`
      SELECT r.organization_id AS "organizationId", r.ended_at AS "endedAt",
             EXISTS (SELECT 1 FROM device_signature_records s WHERE s.registration_id = r.id) AS "signatureRecorded"
        FROM device_registrations r WHERE r.id = ${registrationId}::uuid FOR SHARE`;

    return rows[0] ?? null;
  }

  /** Whether the version of the notice in force collects the status of tools; null when none is published. */
  async noticeIncludesToolStatus(organizationId: string, tx?: DbTx): Promise<boolean | null> {
    const notice = await (tx ?? this.prisma).monitoringNoticeVersion.findFirst({
      where: { organizationId },
      orderBy: { versionNumber: 'desc' },
      select: { includesToolStatus: true },
    });

    return notice ? notice.includesToolStatus : null;
  }

  async recordAccepted(tx: DbTx, credentialId: string, at: Date): Promise<void> {
    await tx.$executeRaw`
      UPDATE device_credentials SET last_accepted_at = GREATEST(COALESCE(last_accepted_at, ${at}), ${at})
       WHERE id = ${credentialId}::uuid AND revoked_at IS NULL`;
  }
}

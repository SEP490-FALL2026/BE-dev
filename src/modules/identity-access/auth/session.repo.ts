import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PrincipalContext,
  RefreshTokenSnapshot,
  SessionRevokedReason,
  SessionSnapshot,
  ThrottleSnapshot,
} from '../public/identity-access.types';

/** Owns AuthSession, RefreshToken and LoginThrottle. */
@Injectable()
export class SessionRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    tx: DbTx,
    input: { appUserId: string; idleExpiresAt: Date; absoluteExpiresAt: Date },
  ): Promise<{ id: string }> {
    return tx.authSession.create({ data: input, select: { id: true } });
  }

  async insertRefreshToken(tx: DbTx, input: { tokenHash: string; sessionId: string; expiresAt: Date }): Promise<void> {
    await tx.refreshToken.create({ data: input });
  }

  /** Unlocked: maps a presented token to the session and account it belongs to, so they can be locked. */
  async findRefreshTokenOwner(tokenHash: string): Promise<{ sessionId: string; appUserId: string } | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true, session: { select: { appUserId: true } } },
    });

    return row ? { sessionId: row.sessionId, appUserId: row.session.appUserId } : null;
  }

  async lockSession(tx: DbTx, sessionId: string): Promise<SessionSnapshot | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM auth_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return tx.authSession.findUnique({
      where: { id: sessionId },
      select: { id: true, appUserId: true, revokedAt: true, idleExpiresAt: true, absoluteExpiresAt: true },
    });
  }

  async lockRefreshToken(tx: DbTx, tokenHash: string): Promise<RefreshTokenSnapshot | null> {
    const locked = await tx.$queryRaw<
      { token_hash: string }[]
    >`SELECT token_hash FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
    if (locked.length === 0) return null;

    return tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { tokenHash: true, sessionId: true, expiresAt: true, consumedAt: true },
    });
  }

  async consumeRefreshToken(tx: DbTx, tokenHash: string, replacedBy: string, now: Date): Promise<void> {
    await tx.refreshToken.update({ where: { tokenHash }, data: { consumedAt: now, replacedBy } });
  }

  async touchSession(
    tx: DbTx,
    sessionId: string,
    input: { lastRefreshedAt: Date; idleExpiresAt: Date },
  ): Promise<void> {
    await tx.authSession.update({ where: { id: sessionId }, data: input });
  }

  /** Revokes the session if it is still open. Returns whether this call revoked it. */
  async revokeSession(tx: DbTx, sessionId: string, reason: SessionRevokedReason, now: Date): Promise<boolean> {
    const result = await tx.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });

    return result.count === 1;
  }

  /** Revokes every open session of the account. Returns how many were open. */
  async revokeAllSessions(tx: DbTx, appUserId: string, reason: SessionRevokedReason, now: Date): Promise<number> {
    const result = await tx.authSession.updateMany({
      where: { appUserId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });

    return result.count;
  }

  /** One query for the per-request guard: session, account and effective direct grants. */
  async findPrincipalContext(sessionId: string): Promise<PrincipalContext | null> {
    const row = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        revokedAt: true,
        idleExpiresAt: true,
        absoluteExpiresAt: true,
        appUser: {
          select: {
            id: true,
            employeeId: true,
            employee: { select: { accessBlock: { select: { blockedFrom: true } } } },
            status: true,
            activationState: true,
            roleGrants: { where: { revokedAt: null }, select: { role: true } },
          },
        },
      },
    });
    if (!row) return null;

    return {
      sessionId: row.id,
      sessionRevokedAt: row.revokedAt,
      idleExpiresAt: row.idleExpiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      appUserId: row.appUser.id,
      employeeId: row.appUser.employeeId,
      status: row.appUser.status,
      activationState: row.appUser.activationState,
      directRoles: row.appUser.roleGrants.map((grant) => grant.role),
      accessBlockedFrom: row.appUser.employee.accessBlock
        ? fromDateColumn(row.appUser.employee.accessBlock.blockedFrom)
        : null,
    };
  }

  async findThrottle(organizationId: string, emailKeyHash: string): Promise<ThrottleSnapshot | null> {
    return this.prisma.loginThrottle.findUnique({
      where: { organizationId_emailKeyHash: { organizationId, emailKeyHash } },
      select: { failureCount: true, blockedUntil: true },
    });
  }

  /**
   * Counts one failure in a single atomic statement, so two simultaneous wrong passwords both
   * count. An expired window restarts at 1. Reaching the maximum sets `blocked_until`.
   */
  async recordLoginFailure(input: {
    organizationId: string;
    emailKeyHash: string;
    now: Date;
    windowCutoff: Date;
    maxFailures: number;
    blockedUntil: Date;
  }): Promise<ThrottleSnapshot> {
    const { organizationId, emailKeyHash, maxFailures } = input;
    // Instants go to raw SQL as ISO-8601 strings with an explicit UTC offset. A Date bound as a
    // parameter is serialised in the server's local zone without an offset, and PostgreSQL then
    // reads it in the session zone: on a machine that is not on UTC the instant silently shifts.
    const now = input.now.toISOString();
    const windowCutoff = input.windowCutoff.toISOString();
    const blockedUntil = input.blockedUntil.toISOString();
    const rows = await this.prisma.$queryRaw<{ failure_count: number; blocked_until: Date | null }[]>`
      INSERT INTO login_throttles AS t (organization_id, email_key_hash, failure_count, window_started_at, blocked_until)
      VALUES (${organizationId}::uuid, ${emailKeyHash}, 1, ${now}::timestamptz, NULL)
      ON CONFLICT (organization_id, email_key_hash) DO UPDATE SET
        failure_count = CASE WHEN (t.window_started_at <= ${windowCutoff}::timestamptz OR (t.blocked_until IS NOT NULL AND t.blocked_until <= ${now}::timestamptz)) THEN 1 ELSE t.failure_count + 1 END,
        window_started_at = CASE WHEN (t.window_started_at <= ${windowCutoff}::timestamptz OR (t.blocked_until IS NOT NULL AND t.blocked_until <= ${now}::timestamptz)) THEN ${now}::timestamptz ELSE t.window_started_at END,
        blocked_until = CASE
          WHEN (CASE WHEN (t.window_started_at <= ${windowCutoff}::timestamptz OR (t.blocked_until IS NOT NULL AND t.blocked_until <= ${now}::timestamptz)) THEN 1 ELSE t.failure_count + 1 END) >= ${maxFailures}::int
          THEN COALESCE(CASE WHEN t.blocked_until > ${now}::timestamptz THEN t.blocked_until END, ${blockedUntil}::timestamptz)
          ELSE NULL
        END
      RETURNING failure_count, blocked_until`;

    return { failureCount: rows[0].failure_count, blockedUntil: rows[0].blocked_until };
  }

  async clearThrottle(tx: DbTx, organizationId: string, emailKeyHash: string): Promise<void> {
    await tx.loginThrottle.deleteMany({ where: { organizationId, emailKeyHash } });
  }
}

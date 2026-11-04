import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AppRole, RoleGrantRecord } from '../public/identity-access.types';

/** One advisory-lock key for every change to the approval roles and to the grant of SPENDING_APPROVER, so the pairing rule is checked one writer at a time. */
const APPROVAL_ROLES_LOCK_KEY = 7_300_001;

/** Owns RoleGrant: the roles granted to accounts, with their history. The one writer of `role_grants`. */
@Injectable()
export class RoleGrantRepo {
  constructor(private readonly prisma: PrismaService) {}

  async grantRole(
    tx: DbTx,
    input: { organizationId: string; appUserId: string; role: AppRole; grantedBy?: string },
  ): Promise<{ id: string }> {
    return tx.roleGrant.create({ data: input, select: { id: true } });
  }

  /** Serializes everything that changes the approval roles or grants SPENDING_APPROVER, for the rest of the transaction. Taken first. */
  async lockApprovalRolesForChange(tx: DbTx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${APPROVAL_ROLES_LOCK_KEY}::bigint)`;
  }

  /** True when an account of the organization holds an effective SPENDING_APPROVER grant, whatever its state (QĐ-93a). */
  async spendingApproverIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    const row = await tx.roleGrant.findFirst({
      where: { organizationId, role: 'SPENDING_APPROVER', revokedAt: null },
      select: { id: true },
    });

    return row !== null;
  }

  /** The employee who holds the effective SPENDING_APPROVER grant, whatever the state of the account; null when nobody does. */
  async spendingApproverEmployeeId(client?: DbTx, options?: { forShare?: boolean }): Promise<string | null> {
    if (options?.forShare === true && client !== undefined) return this.spendingApproverLockedFor(client);
    const row = await (client ?? this.prisma).roleGrant.findFirst({
      where: { role: 'SPENDING_APPROVER', revokedAt: null },
      select: { appUser: { select: { employeeId: true } } },
    });

    return row?.appUser.employeeId ?? null;
  }

  /**
   * The same, with the row of the grant locked `FOR SHARE` until the transaction ends: the revocation `UPDATE`s that very row, so a step
   * that is being opened and a revocation that is being made meet on it and take turns (`M6`). A revocation that commits first is seen
   * here — the row no longer matches once the statement is re-evaluated — and nobody holds the role.
   */
  private async spendingApproverLockedFor(tx: DbTx): Promise<string | null> {
    const rows = await tx.$queryRaw<{ employee_id: string }[]>`
      SELECT u.employee_id
        FROM role_grants g
        JOIN app_users u ON u.id = g.app_user_id
       WHERE g.role = 'SPENDING_APPROVER' AND g.revoked_at IS NULL
         FOR SHARE OF g`;

    return rows[0]?.employee_id ?? null;
  }

  /** The employee an account belongs to; null when there is no such account. */
  async employeeOf(tx: DbTx, appUserId: string): Promise<string | null> {
    const row = await tx.appUser.findUnique({ where: { id: appUserId }, select: { employeeId: true } });

    return row?.employeeId ?? null;
  }

  /** The account that holds the effective SUPER_ADMIN grant, whatever its state; null when nobody does. */
  async findSuperAdminHolderId(tx: DbTx): Promise<string | null> {
    const row = await tx.roleGrant.findFirst({
      where: { role: 'SUPER_ADMIN', revokedAt: null },
      select: { appUserId: true },
    });

    return row?.appUserId ?? null;
  }

  /** Which of the roles `roles` each of these people holds on an effective grant, whatever the state of the account (one read). */
  async listHoldersAmong(
    employeeIds: readonly string[],
    roles: readonly AppRole[],
    tx?: DbTx,
  ): Promise<Map<string, AppRole[]>> {
    const held = new Map<string, AppRole[]>();
    if (employeeIds.length === 0) return held;
    const rows = await (tx ?? this.prisma).roleGrant.findMany({
      where: { role: { in: [...roles] }, revokedAt: null, appUser: { employeeId: { in: [...employeeIds] } } },
      select: { role: true, appUser: { select: { employeeId: true } } },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
    });
    for (const row of rows) held.set(row.appUser.employeeId, [...(held.get(row.appUser.employeeId) ?? []), row.role]);

    return held;
  }

  /** How many effective (not revoked) grants each role has, whatever the account state (roles with none are absent). */
  async countEffectiveByRole(tx: DbTx): Promise<Map<AppRole, number>> {
    const groups = await tx.roleGrant.groupBy({
      by: ['role'],
      where: { revokedAt: null },
      _count: { _all: true },
    });

    return new Map(groups.map((group) => [group.role, group._count._all]));
  }

  async effectiveRoles(appUserId: string, tx?: DbTx): Promise<AppRole[]> {
    const rows = await (tx ?? this.prisma).roleGrant.findMany({
      where: { appUserId, revokedAt: null },
      select: { role: true },
      orderBy: { role: 'asc' },
    });

    return rows.map((row) => row.role);
  }

  async effectiveRolesFor(appUserIds: string[]): Promise<Map<string, AppRole[]>> {
    const rows = await this.prisma.roleGrant.findMany({
      where: { appUserId: { in: appUserIds }, revokedAt: null },
      select: { appUserId: true, role: true },
      orderBy: { role: 'asc' },
    });
    const byUser = new Map<string, AppRole[]>();
    for (const row of rows) byUser.set(row.appUserId, [...(byUser.get(row.appUserId) ?? []), row.role]);

    return byUser;
  }

  /** The newest `limit` grants of the account, newest first. */
  async grantHistory(appUserId: string, limit: number): Promise<RoleGrantRecord[]> {
    return this.prisma.roleGrant.findMany({
      where: { appUserId },
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { role: true, grantedAt: true, revokedAt: true },
    });
  }

  /** True when any account in the organization holds an effective FINANCE grant, whatever its state (QĐ-67e). */
  async financeIsHeld(tx: DbTx, organizationId: string): Promise<boolean> {
    const row = await tx.roleGrant.findFirst({
      where: { organizationId, role: 'FINANCE', revokedAt: null },
      select: { id: true },
    });

    return row !== null;
  }

  async revokeRole(
    tx: DbTx,
    input: { appUserId: string; role: AppRole; revokedBy: string; now: Date },
  ): Promise<boolean> {
    const result = await tx.roleGrant.updateMany({
      where: { appUserId: input.appUserId, role: input.role, revokedAt: null },
      data: { revokedAt: input.now, revokedBy: input.revokedBy },
    });

    return result.count === 1;
  }
}

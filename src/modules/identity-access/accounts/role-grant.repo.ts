import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AppRole, RoleGrantRecord } from '../identity-access.types';

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

  /** The account that holds the effective SUPER_ADMIN grant, whatever its state; null when nobody does. */
  async findSuperAdminHolderId(tx: DbTx): Promise<string | null> {
    const row = await tx.roleGrant.findFirst({
      where: { role: 'SUPER_ADMIN', revokedAt: null },
      select: { appUserId: true },
    });

    return row?.appUserId ?? null;
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

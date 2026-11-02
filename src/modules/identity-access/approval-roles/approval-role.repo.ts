import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** The approval roles that are configured here and kept in `approval_role_holders` (SPENDING_APPROVER is a role grant since QĐ-93a). */
export type ApprovalRoleName = 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER';

export const APPROVAL_ROLES: readonly ApprovalRoleName[] = ['CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER'];

/** The table still holds closed SPENDING_APPROVER rows (history before QĐ-93a): every read here names only the roles configured here. */
export const isConfiguredRole = (role: string): role is ApprovalRoleName =>
  (APPROVAL_ROLES as readonly string[]).includes(role);

export interface ApprovalRoleHolderRow {
  id: string;
  role: ApprovalRoleName;
  employeeId: string;
  heldFrom: Date;
  heldUntil: Date | null;
}

/** Owns ApprovalRoleHolder: who holds the substitute and fallback roles, with history (US-01-03). The spending approver is a role grant. */
@Injectable()
export class ApprovalRoleRepo {
  constructor(private readonly prisma: PrismaService) {}

  async currentHolders(client?: DbTx): Promise<ApprovalRoleHolderRow[]> {
    const rows = await (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { heldUntil: null, role: { in: [...APPROVAL_ROLES] } },
      select: { id: true, role: true, employeeId: true, heldFrom: true, heldUntil: true },
      orderBy: { role: 'asc' },
    });

    return rows.filter((row): row is typeof row & { role: ApprovalRoleName } => isConfiguredRole(row.role));
  }

  async history(role: ApprovalRoleName, limit: number): Promise<ApprovalRoleHolderRow[]> {
    const rows = await this.prisma.approvalRoleHolder.findMany({
      where: { role },
      select: { id: true, role: true, employeeId: true, heldFrom: true, heldUntil: true },
      orderBy: [{ heldFrom: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.filter((row): row is typeof row & { role: ApprovalRoleName } => isConfiguredRole(row.role));
  }

  async closeCurrent(tx: DbTx, role: ApprovalRoleName, now: Date): Promise<void> {
    await tx.approvalRoleHolder.updateMany({ where: { role, heldUntil: null }, data: { heldUntil: now } });
  }

  async insert(
    tx: DbTx,
    input: { organizationId: string; role: ApprovalRoleName; employeeId: string; heldFrom: Date; setBy: string },
  ): Promise<{ id: string }> {
    return tx.approvalRoleHolder.create({ data: input, select: { id: true } });
  }

  /** The approval roles the employee holds now (for the checks that must refuse a Super Admin who holds one). */
  async rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<ApprovalRoleName[]> {
    const rows = await (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { employeeId, heldUntil: null, role: { in: [...APPROVAL_ROLES] } },
      select: { role: true },
    });

    return rows.map((row) => row.role).filter(isConfiguredRole);
  }
}

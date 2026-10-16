import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export type ApprovalRoleName = 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER';

export const APPROVAL_ROLES: readonly ApprovalRoleName[] = [
  'SPENDING_APPROVER',
  'CONFLICT_SUBSTITUTE',
  'FALLBACK_APPROVER',
];

export interface ApprovalRoleHolderRow {
  id: string;
  role: ApprovalRoleName;
  employeeId: string;
  heldFrom: Date;
  heldUntil: Date | null;
}

/** One advisory-lock key for every change to the approval roles, so the pairing rule is checked one writer at a time. */
const APPROVAL_ROLES_LOCK_KEY = 7_300_001;

/** Owns ApprovalRoleHolder: who holds the spending approver, substitute and fallback roles, with history (US-01-03). */
@Injectable()
export class ApprovalRoleRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Serializes everything that changes the approval roles for the rest of the transaction. Taken first. */
  async lockForChange(tx: DbTx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${APPROVAL_ROLES_LOCK_KEY}::bigint)`;
  }

  async currentHolders(client?: DbTx): Promise<ApprovalRoleHolderRow[]> {
    return (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { heldUntil: null },
      select: { id: true, role: true, employeeId: true, heldFrom: true, heldUntil: true },
      orderBy: { role: 'asc' },
    });
  }

  async history(role: ApprovalRoleName, limit: number): Promise<ApprovalRoleHolderRow[]> {
    return this.prisma.approvalRoleHolder.findMany({
      where: { role },
      select: { id: true, role: true, employeeId: true, heldFrom: true, heldUntil: true },
      orderBy: [{ heldFrom: 'desc' }, { id: 'asc' }],
      take: limit,
    });
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

  /** Whether the employee is the current spending approver. An unlocked read, for the per-request role check. */
  async isSpendingApprover(employeeId: string): Promise<boolean> {
    const row = await this.prisma.approvalRoleHolder.findFirst({
      where: { employeeId, role: 'SPENDING_APPROVER', heldUntil: null },
      select: { id: true },
    });

    return row !== null;
  }

  /** The approval roles the employee holds now (for the checks that must refuse a Super Admin who holds one). */
  async rolesHeldBy(client: DbTx | undefined, employeeId: string): Promise<ApprovalRoleName[]> {
    const rows = await (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { employeeId, heldUntil: null },
      select: { role: true },
    });

    return rows.map((row) => row.role);
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { APPROVAL_ROLES, isConfiguredRole, type ApprovalRoleName } from './approval-role.repo';

/**
 * The read of who holds the approval roles now, for the facade other modules call (`US-05-03`: who may hold a step).
 * It writes nothing: the one writer of `approval_role_holders` is `ApprovalRoleRepo`, which belongs to the use cases that
 * change the roles and is not part of the facade graph.
 */
@Injectable()
export class ApprovalRoleReaderRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The employee who is the spending approver: the effective role grant, whatever the state of the account; null when nobody is. */
  async spendingApproverEmployeeId(client?: DbTx): Promise<string | null> {
    const row = await (client ?? this.prisma).roleGrant.findFirst({
      where: { role: 'SPENDING_APPROVER', revokedAt: null },
      select: { appUser: { select: { employeeId: true } } },
    });

    return row?.appUser.employeeId ?? null;
  }

  async currentHolders(client?: DbTx): Promise<{ role: ApprovalRoleName; employeeId: string }[]> {
    const rows = await (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { heldUntil: null, role: { in: [...APPROVAL_ROLES] } },
      select: { role: true, employeeId: true },
      orderBy: { role: 'asc' },
    });

    return rows.filter((row): row is typeof row & { role: ApprovalRoleName } => isConfiguredRole(row.role));
  }
}

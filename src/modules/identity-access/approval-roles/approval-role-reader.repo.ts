import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApprovalRoleName } from './approval-role.repo';

/**
 * The read of who holds the approval roles now, for the facade other modules call (`US-05-03`: who may hold a step).
 * It writes nothing: the one writer of `approval_role_holders` is `ApprovalRoleRepo`, which belongs to the use cases that
 * change the roles and is not part of the facade graph.
 */
@Injectable()
export class ApprovalRoleReaderRepo {
  constructor(private readonly prisma: PrismaService) {}

  async currentHolders(client?: DbTx): Promise<{ role: ApprovalRoleName; employeeId: string }[]> {
    return (client ?? this.prisma).approvalRoleHolder.findMany({
      where: { heldUntil: null },
      select: { role: true, employeeId: true },
      orderBy: { role: 'asc' },
    });
  }
}

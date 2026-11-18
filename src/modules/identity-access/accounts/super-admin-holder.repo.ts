import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SuperAdminHolder } from '../public/identity-access.types';

/** The tickets of the recovery procedure that have not finished: the holder waits for a credential nobody has set yet. */
const WAITING_TICKETS = ['PENDING', 'AWAITING_ACTIVATION'] as const;

/** The reader of the one account that holds the Super Admin role, whatever its state (`US-03-04` AC-13). Reads only. */
@Injectable()
export class SuperAdminHolderRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The holder, or null when nobody holds the role (an incident of integrity). */
  async find(tx?: DbTx): Promise<SuperAdminHolder | null> {
    const client = tx ?? this.prisma;
    const user = await client.appUser.findFirst({
      where: { roleGrants: { some: { role: 'SUPER_ADMIN', revokedAt: null } } },
      select: {
        id: true,
        employeeId: true,
        status: true,
        activationState: true,
        employee: { select: { status: true, workState: true } },
      },
    });
    if (!user) return null;
    const waiting = await client.recoveryTicket.findFirst({
      where: { targetAppUserId: user.id, mode: 'RESET_CREDENTIALS', status: { in: [...WAITING_TICKETS] } },
      select: { id: true },
    });

    return {
      appUserId: user.id,
      employeeId: user.employeeId,
      status: user.status,
      activationState: user.activationState,
      employeeStatus: user.employee.status,
      workState: user.employee.workState,
      awaitingCredentialReset: waiting !== null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessRequestState } from './access-request.types';
import { ENDED_STATES } from './cancellation.policy';

/**
 * The requests that are not over, as what keeps a department or a Cost Center in use (`QĐ-90e`, `QĐ-87d(2)`, F15, F16): every state
 * but the ones a request ends in, and but `DRAFT`. A request that waits for the IT Admin to close the task of its withdrawal
 * (`AWAITING_IT_CLOSE`) is not over: the work is still there. A draft is not work yet (spec L.1): no step, no check, no commitment, and
 * the department it will be sent from is the one of the day it is sent, so a draft keeps nothing in use; it has no Cost Center at all.
 */
const NOT_OVER: { notIn: AccessRequestState[] } = { notIn: ['DRAFT', ...ENDED_STATES] };

/** The first requests of a department or a Cost Center that are not over, by id, and how many there are in all. */
export interface RequestUse {
  ids: string[];
  total: number;
}

/**
 * Reads, for the organization, which requests still keep a department or a Cost Center in use. Two statements for each, however many
 * requests: the first `limit` ids and the exact count. A read that no write goes through (the writer is `AccessRequestRepo`).
 */
@Injectable()
export class RequestUseRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The requests sent from the department that are not over. */
  ofDepartment(departmentId: string, limit: number, tx?: DbTx): Promise<RequestUse> {
    return this.read({ departmentId, state: NOT_OVER }, limit, tx);
  }

  /** The requests charged to the Cost Center that are not over: a request with a cost has one, and a draft has none. */
  ofCostCenter(costCenterId: string, limit: number, tx?: DbTx): Promise<RequestUse> {
    return this.read({ costCenterId, state: NOT_OVER }, limit, tx);
  }

  private async read(
    where: { departmentId: string; state: typeof NOT_OVER } | { costCenterId: string; state: typeof NOT_OVER },
    limit: number,
    tx?: DbTx,
  ): Promise<RequestUse> {
    const db = tx ?? this.prisma;
    const rows = await db.accessRequest.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
    const total = await db.accessRequest.count({ where });

    return { ids: rows.map((row) => row.id), total };
  }
}

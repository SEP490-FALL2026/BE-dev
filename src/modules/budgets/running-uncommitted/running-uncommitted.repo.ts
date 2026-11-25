import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface RequestYearCommitmentState {
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
  costCenterId: string;
}

/** Read queries supporting the running uncommitted cost calculation. */
@Injectable()
export class RunningUncommittedRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** State and Cost Center of each request's commitment in `year`, in one read; requests with none are absent. */
  async commitmentsOfRequestsInYear(
    requestIds: readonly string[],
    year: number,
    tx?: DbTx,
  ): Promise<Map<string, RequestYearCommitmentState>> {
    if (requestIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).budgetCommitment.findMany({
      where: { requestId: { in: [...new Set(requestIds)] }, year },
      select: { requestId: true, state: true, costCenterId: true },
    });

    return new Map(rows.map((row) => [row.requestId, { state: row.state, costCenterId: row.costCenterId }]));
  }
}

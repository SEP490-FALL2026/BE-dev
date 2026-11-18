import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AuditFlagRow } from './request-history.types';

/**
 * The flag `NO_NEED_APPROVER`: free internal software sent through the one-step route, the branch whose sending records
 * `ACCESS_REQUEST.NO_NEED_APPROVER`. A paid one-step request is never flagged: it still has a spend step.
 */
const NO_NEED_APPROVER: Prisma.AccessRequestWhereInput = {
  routingMode: 'ONE_STEP',
  branch: 'INTERNAL_FREE',
  state: { not: 'DRAFT' },
};

/** What the history of requests reads beyond the rows of a list: the steps of one request, the requests of the audit report. */
@Injectable()
export class RequestHistoryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The ids of every step of the request: the events of a decision are recorded on the step it decided. */
  async stepIdsOf(requestId: string): Promise<string[]> {
    const rows = await this.prisma.accessRequestStep.findMany({ where: { requestId }, select: { id: true } });

    return rows.map((row) => row.id);
  }

  /**
   * One page of the flagged requests sent in the window, the newest first and then by id, and how many there are, in one snapshot
   * (RepeatableRead). Only the columns of the row: no price, amount, budget, evidence or reason.
   */
  async auditFlagPage(filter: {
    from?: Date;
    to?: Date;
    skip: number;
    take: number;
  }): Promise<{ rows: AuditFlagRow[]; total: number }> {
    const sentAt: Prisma.DateTimeNullableFilter = {
      ...(filter.from === undefined ? {} : { gte: filter.from }),
      ...(filter.to === undefined ? {} : { lt: filter.to }),
    };
    const where: Prisma.AccessRequestWhereInput = {
      ...NO_NEED_APPROVER,
      ...(Object.keys(sentAt).length === 0 ? {} : { submittedAt: sentAt }),
    };
    const { rows, total } = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.accessRequest.findMany({
          where,
          select: {
            id: true,
            submittedAt: true,
            state: true,
            requesterEmployeeId: true,
            departmentId: true,
            planId: true,
            oneStepReason: true,
          },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          skip: filter.skip,
          take: filter.take,
        }),
        total: await tx.accessRequest.count({ where }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      total,
      rows: rows.map((row) => {
        if (row.submittedAt === null) throw new Error(`The flagged request ${row.id} has not been sent.`);

        return { ...row, submittedAt: row.submittedAt };
      }),
    };
  }
}

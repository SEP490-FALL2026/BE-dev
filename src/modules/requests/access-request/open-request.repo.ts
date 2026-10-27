import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessRequestKind, AccessRequestState } from './access-request.types';
import { NOT_OPEN_FOR_LEAVER } from './cancellation.policy';

/** The states of the person of a request for a group whose request is still open for them. */
const OPEN_LINE_STATES = ['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING'] as const;

export interface OpenRequestRow {
  id: string;
  type: AccessRequestKind;
  state: AccessRequestState;
  planId: string | null;
  requesterEmployeeId: string;
  submittedAt: Date;
}

/**
 * The requests a person is the beneficiary of that are still open (`US-03-04` AC-24): one of their own that has not ended, or a line of
 * a request for a group that has not ended. A read that no write goes through (the writer is `AccessRequestRepo`). A page and its total
 * are two statements, however many requests.
 */
@Injectable()
export class OpenRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenRequestRow[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = {
      beneficiaries: { some: { employeeId } },
      // A request being drafted is written by the release after this one and is not read here (spec L.1).
      state: { not: 'DRAFT' as const },
      OR: [
        { type: { not: 'GROUP_GRANT' as const }, state: { notIn: [...NOT_OPEN_FOR_LEAVER] } },
        { type: 'GROUP_GRANT' as const, lines: { some: { employeeId, state: { in: [...OPEN_LINE_STATES] } } } },
      ],
    };
    const [rows, total] = await Promise.all([
      db.accessRequest.findMany({
        where,
        select: { id: true, type: true, state: true, planId: true, requesterEmployeeId: true, submittedAt: true },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      db.accessRequest.count({ where }),
    ]);

    return { items: rows, total };
  }
}

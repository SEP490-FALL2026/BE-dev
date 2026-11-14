import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AccessRequestKind, AccessRequestState } from '../access-request.types';
import { ENDED_STATES, NOT_OPEN_FOR_LEAVER } from '../access-request.types';
import { currentStateOf } from '../access-request.policy';
import { OPEN_LINE_STATES, type LineState } from '../group-request.types';

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

  /**
   * What makes a request open for the person (see the class): shared by the page and by the ids. `withWithdrawalWaiting` also takes in
   * the request, or the line, withdrawn while its grant had failed, whose task waits for the IT Admin to close it (`AWAITING_IT_CLOSE`):
   * the page for the IT Admin leaves it out, the system that closes the requests of a person who is gone does not.
   */
  private openOf(employeeId: string, filter: { departmentId?: string } = {}, withWithdrawalWaiting = false) {
    const endedStates = withWithdrawalWaiting ? ENDED_STATES : NOT_OPEN_FOR_LEAVER;
    const lineStates: readonly LineState[] = withWithdrawalWaiting
      ? [...OPEN_LINE_STATES, 'AWAITING_IT_CLOSE']
      : OPEN_LINE_STATES;

    return {
      beneficiaries: { some: { employeeId } },
      ...(filter.departmentId === undefined ? {} : { departmentId: filter.departmentId }),
      // A request being drafted is written by the release after this one and is not read here.
      state: { not: 'DRAFT' as const },
      OR: [
        { type: { not: 'GROUP_GRANT' as const }, state: { notIn: [...endedStates] } },
        { type: 'GROUP_GRANT' as const, lines: { some: { employeeId, state: { in: [...lineStates] } } } },
      ],
    };
  }

  /**
   * The ids of every request the person is a beneficiary of that is open, oldest first, in the caller's transaction, those with a
   * withdrawal waiting for the IT Admin among them: what the system deals with when the person is gone (`BeneficiaryGoneCancellation`). A person has few open requests (the limits of `MF-1` bound them),
   * so there is no page; the order is fixed so two passes lock them in the same order.
   */
  async idsOf(tx: DbTx, employeeId: string): Promise<string[]> {
    const rows = await tx.accessRequest.findMany({
      where: this.openOf(employeeId, {}, true),
      select: { id: true },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => row.id);
  }

  /** `filter.departmentId` keeps only the requests sent from that department (a department head reads the open work of a member). */
  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
    filter: { departmentId?: string } = {},
  ): Promise<{ items: OpenRequestRow[]; total: number }> {
    const where = this.openOf(employeeId, filter);
    const read = async (client: DbTx) => {
      const rows = await client.accessRequest.findMany({
        where,
        select: { id: true, type: true, state: true, planId: true, requesterEmployeeId: true, submittedAt: true },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      });
      const total = await client.accessRequest.count({ where });

      return {
        items: rows.map((row) => {
          // The filter above leaves drafts out, and only a draft has no moment it was sent.
          if (row.submittedAt === null)
            throw new Error(`The request ${row.id} is listed as open but has not been sent.`);

          return { ...row, state: currentStateOf(row.state), submittedAt: row.submittedAt };
        }),
        total,
      };
    };

    // The page and its total share one snapshot when the caller has no transaction of its own (`API-LIST-DETAIL.1`).
    return tx
      ? read(tx)
      : this.prisma.$transaction(read, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

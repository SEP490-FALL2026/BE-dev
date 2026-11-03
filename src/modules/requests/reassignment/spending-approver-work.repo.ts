import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ENDED_STATES, type AccessRequestState } from '../access-request/access-request.types';

/** How a person stands in a request that is still open. */
export type RequestParty = 'REQUESTER' | 'BENEFICIARY' | 'RESPONSIBLE';

export interface OpenRequestOfPerson {
  id: string;
  party: RequestParty;
}

/** The states of the person of a request for a group whose own line is not over (the same reading as the open requests of a leaver). */
const OPEN_LINE_STATES = ['AWAITING_NEED', 'NEED_CONFIRMED', 'APPROVED', 'EXECUTING', 'AWAITING_IT_CLOSE'] as const;

/** A request that is not over: every state but the ones it ends in, and but `DRAFT`, which is not a request yet (OD-5). */
const NOT_OVER: AccessRequestState[] = ['DRAFT', ...ENDED_STATES];

/**
 * Reads the open work of one person in the context of requests, for the grant of the spending approver (`QĐ-93d`(3), `US-01-03`
 * AC-12): the requests they sent, those sent for them, the service accounts they answer for, and the returns of seats they asked for
 * or hold. A read in the transaction of the grant that no write goes through. Each is a statement of its own and takes at most `limit`
 * rows, by id.
 */
@Injectable()
export class SpendingApproverWorkRepo {
  /** The requests the person sent that are not over. */
  async sentBy(tx: DbTx, employeeId: string, limit: number): Promise<OpenRequestOfPerson[]> {
    const rows = await tx.accessRequest.findMany({
      where: { requesterEmployeeId: employeeId, state: { notIn: NOT_OVER } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({ id: row.id, party: 'REQUESTER' }));
  }

  /** The requests the person is one of the people of that are not over: their own request, or a line of a request for a group that is not over. */
  async forPerson(tx: DbTx, employeeId: string, limit: number): Promise<OpenRequestOfPerson[]> {
    const rows = await tx.accessRequest.findMany({
      where: {
        beneficiaries: { some: { employeeId } },
        state: { notIn: NOT_OVER },
        OR: [
          { type: { not: 'GROUP_GRANT' } },
          { type: 'GROUP_GRANT', lines: { some: { employeeId, state: { in: [...OPEN_LINE_STATES] } } } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({ id: row.id, party: 'BENEFICIARY' }));
  }

  /** The requests for a service account the person answers for that are not over. */
  async answeredFor(tx: DbTx, employeeId: string, limit: number): Promise<OpenRequestOfPerson[]> {
    const rows = await tx.accessRequestServiceAccount.findMany({
      where: { responsibleEmployeeId: employeeId, request: { state: { notIn: NOT_OVER } } },
      select: { requestId: true },
      orderBy: { requestId: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({ id: row.requestId, party: 'RESPONSIBLE' }));
  }

  /** The returns of a seat that still wait for the revocation, which the person asked for or whose seat is theirs. */
  async openReturnsOf(tx: DbTx, employeeId: string, limit: number): Promise<string[]> {
    const rows = await tx.returnRequest.findMany({
      where: {
        state: 'AWAITING_REVOCATION',
        OR: [{ requestedByEmployeeId: employeeId }, { holderEmployeeId: employeeId }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: limit,
    });

    return rows.map((row) => row.id);
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  SPENDING_APPROVER_BLOCKER_LIMIT,
  SpendingApproverGrantChecks,
  type SpendingApproverBlocker,
  type SpendingApproverGrantCheck,
} from '../../identity-access/public/identity-access.extension-points';
import { SpendingApproverWorkRepo, type OpenRequestOfPerson } from './spending-approver-work.repo';

/** Which way of standing in a request says the most when a person stands in it in more than one. */
const PARTY_ORDER = ['REQUESTER', 'RESPONSIBLE', 'BENEFICIARY'] as const;

/**
 * The open work of the requests that keeps a person from becoming the spending approver (`QĐ-93d`(3), `US-01-03` AC-12): a request that
 * is not over which they sent, are one of the people of, or answer for as the owner of its service account, and a return of a seat that
 * still waits for the revocation. A draft is not work (OD-5), and a request that ended is not either. It adds itself to the checks of the
 * grant when the module starts, so identity-access never imports this module. A fixed number of statements, however much work there is.
 */
@Injectable()
export class RequestsSpendingApproverGrantCheck implements SpendingApproverGrantCheck, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [SpendingApproverGrantChecks] as const;

  constructor(
    private readonly repo: SpendingApproverWorkRepo,
    private readonly checks: SpendingApproverGrantChecks,
  ) {}

  onModuleInit(): void {
    this.checks.add('requests.open-work', this);
  }

  async blockersOf(tx: DbTx, employeeId: string): Promise<SpendingApproverBlocker[]> {
    const limit = SPENDING_APPROVER_BLOCKER_LIMIT + 1;
    const parties: OpenRequestOfPerson[] = [
      ...(await this.repo.sentBy(tx, employeeId, limit)),
      ...(await this.repo.answeredFor(tx, employeeId, limit)),
      ...(await this.repo.forPerson(tx, employeeId, limit)),
    ];
    const requests = new Map<string, OpenRequestOfPerson>();
    for (const party of parties) {
      const known = requests.get(party.id);
      if (!known || PARTY_ORDER.indexOf(party.party) < PARTY_ORDER.indexOf(known.party)) requests.set(party.id, party);
    }

    return [
      ...[...requests.values()].map((request): SpendingApproverBlocker => ({
        kind: 'REQUEST',
        id: request.id,
        label: 'Access request that is not over',
        partyRole: request.party,
      })),
      ...(await this.repo.openReturnsOf(tx, employeeId, limit)).map((id): SpendingApproverBlocker => ({
        kind: 'RETURN_REQUEST',
        id,
        label: 'Return of a seat awaiting revocation',
      })),
    ];
  }
}

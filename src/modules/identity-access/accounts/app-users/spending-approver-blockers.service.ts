import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import {
  SPENDING_APPROVER_BLOCKER_LIMIT,
  SpendingApproverGrantChecks,
  type SpendingApproverBlocker,
} from '../../public/identity-access.extension-points';

/** The open work of one person that keeps them from the role, in a fixed order, and whether the list was cut at the limit. */
export interface SpendingApproverBlockers {
  blockers: SpendingApproverBlocker[];
  truncated: boolean;
}

/**
 * Asks every module that added a check what open work the person is a party of (`QĐ-93d`(3), rule 10 of the grant of SPENDING_APPROVER).
 * The checks run one after the other in the transaction of the grant, after the account was locked `FOR UPDATE`; the answer is ordered by
 * kind and id so that the same data gives the same refusal, and at most `SPENDING_APPROVER_BLOCKER_LIMIT` items are kept.
 */
@Injectable()
export class SpendingApproverBlockersService {
  constructor(private readonly checks: SpendingApproverGrantChecks) {}

  async of(tx: DbTx, employeeId: string): Promise<SpendingApproverBlockers> {
    const found: SpendingApproverBlocker[] = [];
    for (const check of this.checks.all()) found.push(...(await check.blockersOf(tx, employeeId)));
    found.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));

    return {
      blockers: found.slice(0, SPENDING_APPROVER_BLOCKER_LIMIT),
      truncated: found.length > SPENDING_APPROVER_BLOCKER_LIMIT,
    };
  }
}

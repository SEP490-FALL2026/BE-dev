import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestPartyEligibilityService } from '../request-party/request-party-eligibility.service';
import type { RequestPartyBlock, RequestPartyReason, RequestParties } from './request-party.types';

/** Public facade: who can never ask for or be given access through a Request (`D-S21`). */
@Injectable()
export class RequestPartyEligibilityApi {
  constructor(private readonly eligibility: RequestPartyEligibilityService) {}

  /**
   * Locks the accounts of the parties `FOR SHARE` in the order of their ids, then judges; throws `RequestPartyIneligibleError`. Call it in
   * the transaction of the Request, right after the lock of the employees of the route and before any read of a department.
   */
  assertEligible(tx: DbTx, parties: RequestParties): Promise<void> {
    return this.eligibility.assertEligible(tx, parties);
  }

  /** The same judgment with no lock and no throw: the preview, `/group-requests/check` and the caller of the candidate list. */
  blockOf(parties: RequestParties, tx?: DbTx): Promise<RequestPartyBlock | null> {
    return this.eligibility.blockOf(parties, tx);
  }

  /**
   * The reason of each person who can never be a party: the keys filter a list of candidates, the values are the reason of a group line.
   * `lockForShare` (needs `tx`) locks as `assertEligible` does: the lines of `groupRequestSubmit`.
   */
  ineligibleAmong(
    employeeIds: readonly string[],
    tx?: DbTx,
    options?: { lockForShare?: boolean },
  ): Promise<ReadonlyMap<string, RequestPartyReason>> {
    return this.eligibility.ineligibleAmong(employeeIds, tx, options);
  }
}

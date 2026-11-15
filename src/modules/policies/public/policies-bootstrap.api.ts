import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { InitialPoliciesService, type InitialPoliciesResult } from '../initial/initial-policies.service';
import { INITIAL_CHANGE_NOTE } from '../initial/initial-policies.policy';

/** What installation and the demo dataset call to give the organization its policies: the library is not usable without them. */
@Injectable()
export class PoliciesBootstrapApi {
  constructor(private readonly initial: InitialPoliciesService) {}

  /**
   * Writes the eight policies with their first version in the caller's transaction; a second call changes nothing. `changeNote` is the
   * ground of the issue of version one: the product template by default, a decision number for the demo.
   */
  seedInitialPolicies(
    tx: DbTx,
    organizationId: string,
    changeNote: string = INITIAL_CHANGE_NOTE,
  ): Promise<InitialPoliciesResult> {
    return this.initial.seed(tx, organizationId, changeNote);
  }
}
